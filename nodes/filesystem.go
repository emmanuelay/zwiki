package nodes

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/adrg/frontmatter"
	"github.com/emmanuelay/zwiki/models"
	"github.com/emmanuelay/zwiki/pkg/md5"
)

type Repository interface {
	GetAll(ctx context.Context) (models.Folder, error)
	GetNode(ctx context.Context, path string) (models.Node, error)
	CreateNode(ctx context.Context, path string, node models.Node) error
	UpdateNode(ctx context.Context, path string, node models.Node) error
	DeleteNode(ctx context.Context, path string, node models.Node) error
}

type fileSystemRepository struct {
	root string
}

func NewFileSystemRepository(root string) Repository {
	return &fileSystemRepository{
		root: root,
	}
}

func (repo *fileSystemRepository) GetAll(ctx context.Context) (models.Folder, error) {
	absoluteRoot, err := filepath.Abs(repo.root)
	if err != nil {
		return models.Folder{}, err
	}

	nodes := []models.Node{}

	err = filepath.WalkDir(absoluteRoot, func(path string, d fs.DirEntry, err error) error {

		if strings.Contains(path, ".git/") || strings.Contains(path, ".vscode/") || strings.HasPrefix(d.Name(), ".") {
			return nil
		}

		if filepath.Ext(d.Name()) == ".md" && !d.IsDir() {
			title := strings.TrimSuffix(filepath.Base(path), ".md")

			// Read frontmatter title if available
			if data, readErr := os.ReadFile(path); readErr == nil {
				var matter map[string]any
				if _, parseErr := frontmatter.Parse(bytes.NewReader(data), &matter); parseErr == nil {
					if fmTitle, ok := matter["title"].(string); ok && fmTitle != "" {
						title = fmTitle
					}
				}
			}

			node := models.Node{
				ID:    md5.Hash(path),
				Path:  strings.ReplaceAll(path, absoluteRoot, ""),
				Title: title,
				Slug:  models.Slug(strings.ReplaceAll(d.Name(), ".md", "")),
			}
			if fi, err := d.Info(); err == nil {
				node.ModTime = fi.ModTime().Unix()
			}

			nodes = append(nodes, node)
			return nil
		}

		if d.IsDir() {
			return nil
		}

		return nil
	})

	if err != nil {
		return models.Folder{}, err
	}

	// Augment list of nodes to tree
	root := models.Folder{
		ID:      "root",
		Folders: []models.Folder{},
		Nodes:   []models.Node{},
	}

	for idx := range nodes {
		node := nodes[idx]
		path := filepath.Dir(node.Path)
		folder := root.FindFolder(strings.Split(path, string(os.PathSeparator)))
		folder.Nodes = append(folder.Nodes, node)
	}

	sortFolder(&root)

	return root, nil
}

func sortFolder(f *models.Folder) {
	sort.Slice(f.Nodes, func(i, j int) bool {
		return naturalLess(f.Nodes[i].Title, f.Nodes[j].Title)
	})
	sort.Slice(f.Folders, func(i, j int) bool {
		return naturalLess(f.Folders[i].Name, f.Folders[j].Name)
	})
	for idx := range f.Folders {
		sortFolder(&f.Folders[idx])
	}
}

func naturalLess(a, b string) bool {
	a = strings.ToLower(a)
	b = strings.ToLower(b)

	for len(a) > 0 && len(b) > 0 {
		aDigit := a[0] >= '0' && a[0] <= '9'
		bDigit := b[0] >= '0' && b[0] <= '9'

		if aDigit && bDigit {
			// Extract numeric parts
			aNum, aRest := extractNumber(a)
			bNum, bRest := extractNumber(b)
			if aNum != bNum {
				return aNum < bNum
			}
			a = aRest
			b = bRest
		} else if aDigit != bDigit {
			return aDigit
		} else {
			if a[0] != b[0] {
				return a[0] < b[0]
			}
			a = a[1:]
			b = b[1:]
		}
	}

	return len(a) < len(b)
}

func extractNumber(s string) (int, string) {
	i := 0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		i++
	}
	n := 0
	for _, c := range s[:i] {
		n = n*10 + int(c-'0')
	}
	return n, s[i:]
}

func (repo *fileSystemRepository) GetNode(ctx context.Context, path string) (models.Node, error) {
	fullPath := filepath.Join(repo.root, path)
	absolutePath, err := filepath.Abs(fullPath)
	if err != nil {
		return models.Node{}, fmt.Errorf("failed building path: %w", err)
	}

	data, err := os.ReadFile(absolutePath)
	if err != nil {
		return models.Node{}, fmt.Errorf("failed reading file at '%v': %w", absolutePath, err)
	}

	var matter map[string]any
	body, err := frontmatter.Parse(bytes.NewReader(data), &matter)
	if err != nil {
		return models.Node{}, fmt.Errorf("failed parsing frontmatter: %w", err)
	}

	meta := make(map[string]string)
	for k, v := range matter {
		meta[k] = fmt.Sprintf("%v", v)
	}

	content := strings.TrimSpace(string(body))
	outline := parseOutline(content)

	node := models.Node{
		ID:      absolutePath,
		Content: content,
		Meta:    meta,
		Outline: outline,
	}

	return node, nil
}

func parseOutline(content string) []models.OutlineEntry {
	var flat []models.OutlineEntry

	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "#") {
			continue
		}

		// Count heading level
		level := 0
		for _, ch := range trimmed {
			if ch == '#' {
				level++
			} else {
				break
			}
		}

		// Must be followed by a space to be a valid heading
		if level == 0 || level >= len(trimmed) || trimmed[level] != ' ' {
			continue
		}

		text := strings.TrimSpace(trimmed[level+1:])
		flat = append(flat, models.OutlineEntry{
			Level:    level,
			Text:     text,
			Children: []models.OutlineEntry{},
		})
	}

	return buildOutlineTree(flat)
}

func buildOutlineTree(flat []models.OutlineEntry) []models.OutlineEntry {
	var root []models.OutlineEntry
	var stack []*models.OutlineEntry

	for i := range flat {
		entry := &flat[i]

		// Pop stack until we find a parent with a lower level
		for len(stack) > 0 && stack[len(stack)-1].Level >= entry.Level {
			stack = stack[:len(stack)-1]
		}

		if len(stack) == 0 {
			root = append(root, *entry)
			stack = append(stack, &root[len(root)-1])
		} else {
			parent := stack[len(stack)-1]
			parent.Children = append(parent.Children, *entry)
			stack = append(stack, &parent.Children[len(parent.Children)-1])
		}
	}

	return root
}

func (repo *fileSystemRepository) CreateNode(ctx context.Context, path string, node models.Node) error {
	return errors.New("not implemented")
}

func (repo *fileSystemRepository) UpdateNode(ctx context.Context, path string, node models.Node) error {
	fullPath := filepath.Join(repo.root, path)
	absolutePath, err := filepath.Abs(fullPath)
	if err != nil {
		return fmt.Errorf("failed building path: %w", err)
	}

	// Preserve existing frontmatter
	existing, err := os.ReadFile(absolutePath)
	if err != nil {
		return fmt.Errorf("failed reading file: %w", err)
	}

	var content string
	raw := string(existing)
	if strings.HasPrefix(raw, "---\n") {
		if end := strings.Index(raw[4:], "\n---"); end != -1 {
			frontmatterBlock := raw[:4+end+4]
			content = frontmatterBlock + "\n" + node.Content + "\n"
		} else {
			content = node.Content + "\n"
		}
	} else {
		content = node.Content + "\n"
	}

	return os.WriteFile(absolutePath, []byte(content), 0644)
}

func (repo *fileSystemRepository) DeleteNode(ctx context.Context, path string, node models.Node) error {
	return errors.New("not implemented")
}
