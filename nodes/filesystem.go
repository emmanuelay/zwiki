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
	GetNodeContent(path string) (string, error)
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

			// Read frontmatter if available
			var meta map[string]string
			if data, readErr := os.ReadFile(path); readErr == nil {
				var matter map[string]any
				if _, parseErr := frontmatter.Parse(bytes.NewReader(data), &matter); parseErr == nil {
					if fmTitle, ok := matter["title"].(string); ok && fmTitle != "" {
						title = fmTitle
					}
					meta = make(map[string]string)
					for k, v := range matter {
						meta[k] = fmt.Sprintf("%v", v)
					}
				}
			}

			node := models.Node{
				ID:    md5.Hash(path),
				Path:  strings.ReplaceAll(path, absoluteRoot, ""),
				Title: title,
				Slug:  models.Slug(strings.ReplaceAll(d.Name(), ".md", "")),
				Meta:  meta,
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

	node := models.Node{
		ID:      absolutePath,
		Path:    "/" + strings.TrimPrefix(path, "/"),
		Content: content,
		Meta:    meta,
	}

	return node, nil
}

func (repo *fileSystemRepository) GetNodeContent(path string) (string, error) {
	fullPath := filepath.Join(repo.root, path)
	absolutePath, err := filepath.Abs(fullPath)
	if err != nil {
		return "", err
	}

	data, err := os.ReadFile(absolutePath)
	if err != nil {
		return "", err
	}

	var matter map[string]any
	body, err := frontmatter.Parse(bytes.NewReader(data), &matter)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(string(body)), nil
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

	var buf strings.Builder

	if len(node.Meta) > 0 {
		buf.WriteString("---\n")
		for k, v := range node.Meta {
			buf.WriteString(k)
			buf.WriteString(": ")
			buf.WriteString(v)
			buf.WriteString("\n")
		}
		buf.WriteString("---\n")
	}

	buf.WriteString(node.Content)
	buf.WriteString("\n")

	return os.WriteFile(absolutePath, []byte(buf.String()), 0644)
}

func (repo *fileSystemRepository) DeleteNode(ctx context.Context, path string, node models.Node) error {
	return errors.New("not implemented")
}
