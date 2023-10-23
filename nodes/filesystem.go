package nodes

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

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
			node := models.Node{
				ID:    md5.Hash(path),
				Path:  strings.ReplaceAll(path, absoluteRoot, ""),
				Title: strings.TrimSuffix(filepath.Base(path), ".md"),
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

	return root, nil
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

	node := models.Node{
		ID:      absolutePath,
		Content: string(data),
	}

	return node, nil
}

func (repo *fileSystemRepository) CreateNode(ctx context.Context, path string, node models.Node) error {
	return errors.New("not implemented")
}

func (repo *fileSystemRepository) UpdateNode(ctx context.Context, path string, node models.Node) error {
	return errors.New("not implemented")
}

func (repo *fileSystemRepository) DeleteNode(ctx context.Context, path string, node models.Node) error {
	return errors.New("not implemented")
}
