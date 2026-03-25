package search

import (
	"fmt"
	"strings"
	"sync"

	"github.com/blevesearch/bleve/v2"
	"github.com/blevesearch/bleve/v2/search/query"
	"github.com/emmanuelay/zwiki/models"
)

type Document struct {
	Path    string   `json:"path"`
	Title   string   `json:"title"`
	Content string   `json:"content"`
	Tags    []string `json:"tags"`
}

type Result struct {
	Path      string              `json:"path"`
	Title     string              `json:"title"`
	Score     float64             `json:"score"`
	Fragments map[string][]string `json:"fragments,omitempty"`
	Tags      []string            `json:"tags,omitempty"`
}

type FacetEntry struct {
	Term  string `json:"term"`
	Count int    `json:"count"`
}

type Index struct {
	index        bleve.Index
	indexedPaths map[string]bool
	mu           sync.RWMutex
}

func NewIndex() (*Index, error) {
	mapping := bleve.NewIndexMapping()

	docMapping := bleve.NewDocumentMapping()

	titleField := bleve.NewTextFieldMapping()
	titleField.Analyzer = "en"
	titleField.Store = true
	docMapping.AddFieldMappingsAt("title", titleField)

	contentField := bleve.NewTextFieldMapping()
	contentField.Analyzer = "en"
	contentField.Store = true
	docMapping.AddFieldMappingsAt("content", contentField)

	pathField := bleve.NewTextFieldMapping()
	pathField.Store = true
	pathField.Index = false
	docMapping.AddFieldMappingsAt("path", pathField)

	tagsField := bleve.NewKeywordFieldMapping()
	tagsField.Store = true
	docMapping.AddFieldMappingsAt("tags", tagsField)

	mapping.AddDocumentMapping("node", docMapping)
	mapping.DefaultMapping = docMapping

	idx, err := bleve.NewMemOnly(mapping)
	if err != nil {
		return nil, fmt.Errorf("failed creating in-memory index: %w", err)
	}

	return &Index{index: idx, indexedPaths: make(map[string]bool)}, nil
}

func (si *Index) BuildFromFolder(folder models.Folder, repo nodeReader) error {
	nodes := flattenFolder(folder)
	batch := si.index.NewBatch()

	si.mu.Lock()
	defer si.mu.Unlock()

	for _, n := range nodes {
		content, err := readNodeContent(repo, n.Path)
		if err != nil {
			continue
		}
		doc := Document{
			Path:    n.Path,
			Title:   n.Title,
			Content: content,
			Tags:    parseTags(n.Meta),
		}
		batch.Index(n.Path, doc)
		si.indexedPaths[n.Path] = true
	}

	return si.index.Batch(batch)
}

func (si *Index) Rebuild(folder models.Folder, repo nodeReader) error {
	nodes := flattenFolder(folder)

	currentPaths := make(map[string]bool, len(nodes))
	for _, n := range nodes {
		currentPaths[n.Path] = true
	}

	si.mu.Lock()
	defer si.mu.Unlock()

	// Delete stale entries
	for path := range si.indexedPaths {
		if !currentPaths[path] {
			si.index.Delete(path)
			delete(si.indexedPaths, path)
		}
	}

	// Re-index all current nodes
	batch := si.index.NewBatch()
	for _, n := range nodes {
		content, err := readNodeContent(repo, n.Path)
		if err != nil {
			continue
		}
		doc := Document{
			Path:    n.Path,
			Title:   n.Title,
			Content: content,
			Tags:    parseTags(n.Meta),
		}
		batch.Index(n.Path, doc)
		si.indexedPaths[n.Path] = true
	}

	return si.index.Batch(batch)
}

type nodeReader interface {
	GetNodeContent(path string) (string, error)
}

func readNodeContent(repo nodeReader, path string) (string, error) {
	return repo.GetNodeContent(path)
}

func parseTags(meta map[string]string) []string {
	raw, ok := meta["tags"]
	if !ok || raw == "" {
		return nil
	}
	var tags []string
	for _, t := range strings.Split(raw, ",") {
		t = strings.TrimSpace(t)
		if t != "" {
			tags = append(tags, t)
		}
	}
	return tags
}

func flattenFolder(folder models.Folder) []models.Node {
	var result []models.Node
	result = append(result, folder.Nodes...)
	for _, sub := range folder.Folders {
		result = append(result, flattenFolder(sub)...)
	}
	return result
}

func (si *Index) Search(searchQuery string, limit int) ([]Result, map[string][]FacetEntry, error) {
	if limit <= 0 {
		limit = 20
	}

	terms := strings.Fields(strings.ToLower(searchQuery))
	var queries []query.Query
	for _, term := range terms {
		queries = append(queries, bleve.NewWildcardQuery("*"+term+"*"))
	}

	var q query.Query
	if len(queries) == 1 {
		q = queries[0]
	} else {
		q = bleve.NewConjunctionQuery(queries...)
	}

	req := bleve.NewSearchRequestOptions(q, limit, 0, false)
	req.Highlight = bleve.NewHighlightWithStyle("html")
	req.Fields = []string{"title", "path", "tags"}
	req.AddFacet("tags", bleve.NewFacetRequest("tags", 50))

	res, err := si.index.Search(req)
	if err != nil {
		return nil, nil, fmt.Errorf("search failed: %w", err)
	}

	results := make([]Result, 0, len(res.Hits))
	for _, hit := range res.Hits {
		r := Result{
			Path:      hit.ID,
			Score:     hit.Score,
			Fragments: hit.Fragments,
		}
		if title, ok := hit.Fields["title"].(string); ok {
			r.Title = title
		}
		if tags, ok := hit.Fields["tags"]; ok {
			switch v := tags.(type) {
			case string:
				r.Tags = []string{v}
			case []interface{}:
				for _, t := range v {
					if s, ok := t.(string); ok {
						r.Tags = append(r.Tags, s)
					}
				}
			}
		}
		results = append(results, r)
	}

	var facets map[string][]FacetEntry
	if tagFacet, ok := res.Facets["tags"]; ok && len(tagFacet.Terms.Terms()) > 0 {
		facets = map[string][]FacetEntry{}
		for _, term := range tagFacet.Terms.Terms() {
			facets["tags"] = append(facets["tags"], FacetEntry{
				Term:  term.Term,
				Count: term.Count,
			})
		}
	}

	return results, facets, nil
}

func (si *Index) IndexNode(node models.Node) error {
	doc := Document{
		Path:    node.Path,
		Title:   node.Title,
		Content: node.Content,
		Tags:    parseTags(node.Meta),
	}
	return si.index.Index(node.Path, doc)
}

func (si *Index) DeleteNode(path string) error {
	return si.index.Delete(path)
}
