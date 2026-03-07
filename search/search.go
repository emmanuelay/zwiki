package search

import (
	"fmt"

	"github.com/blevesearch/bleve/v2"
	"github.com/emmanuelay/zwiki/models"
)

type Document struct {
	Path    string `json:"path"`
	Title   string `json:"title"`
	Content string `json:"content"`
}

type Result struct {
	Path      string              `json:"path"`
	Title     string              `json:"title"`
	Score     float64             `json:"score"`
	Fragments map[string][]string `json:"fragments,omitempty"`
}

type Index struct {
	index bleve.Index
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

	mapping.AddDocumentMapping("node", docMapping)
	mapping.DefaultMapping = docMapping

	idx, err := bleve.NewMemOnly(mapping)
	if err != nil {
		return nil, fmt.Errorf("failed creating in-memory index: %w", err)
	}

	return &Index{index: idx}, nil
}

func (si *Index) BuildFromFolder(folder models.Folder, repo nodeReader) error {
	nodes := flattenFolder(folder)
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
		}
		batch.Index(n.Path, doc)
	}

	return si.index.Batch(batch)
}

type nodeReader interface {
	GetNodeContent(path string) (string, error)
}

func readNodeContent(repo nodeReader, path string) (string, error) {
	return repo.GetNodeContent(path)
}

func flattenFolder(folder models.Folder) []models.Node {
	var result []models.Node
	result = append(result, folder.Nodes...)
	for _, sub := range folder.Folders {
		result = append(result, flattenFolder(sub)...)
	}
	return result
}

func (si *Index) Search(query string, limit int) ([]Result, error) {
	if limit <= 0 {
		limit = 20
	}

	q := bleve.NewQueryStringQuery(query)
	req := bleve.NewSearchRequestOptions(q, limit, 0, false)
	req.Highlight = bleve.NewHighlightWithStyle("html")
	req.Fields = []string{"title", "path"}

	res, err := si.index.Search(req)
	if err != nil {
		return nil, fmt.Errorf("search failed: %w", err)
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
		results = append(results, r)
	}

	return results, nil
}

func (si *Index) IndexNode(node models.Node) error {
	doc := Document{
		Path:    node.Path,
		Title:   node.Title,
		Content: node.Content,
	}
	return si.index.Index(node.Path, doc)
}

func (si *Index) DeleteNode(path string) error {
	return si.index.Delete(path)
}
