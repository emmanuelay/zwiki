package nodes

import (
	"context"
	"errors"
	"io/fs"
	"path/filepath"
	"strings"

	"github.com/emmanuelay/zwiki/models"
)

type Repository interface {
	GetAll(ctx context.Context) ([]models.Node, error)
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

func (repo *fileSystemRepository) GetAll(ctx context.Context) ([]models.Node, error) {
	absoluteRoot, err := filepath.Abs(repo.root)
	if err != nil {
		return nil, err
	}

	nodes := []models.Node{}

	err = filepath.WalkDir(absoluteRoot, func(path string, d fs.DirEntry, err error) error {

		if strings.Contains(path, ".git/") || strings.Contains(path, ".vscode/") || strings.HasPrefix(d.Name(), ".") {
			return nil
		}

		if filepath.Ext(d.Name()) == ".md" && !d.IsDir() {
			nodes = append(nodes, models.Node{
				ID: path,
			})
			return nil
		}

		if d.IsDir() {
			return nil
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// TODO(ea): read frontmatter & timestamps of all files

	return nodes, nil
}

func (repo *fileSystemRepository) GetNode(ctx context.Context, path string) (models.Node, error) {
	return models.Node{}, errors.New("not implemented")
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
