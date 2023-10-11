package nodes

import (
	"errors"

	"github.com/emmanuelay/zwiki/models"
)

type Repository interface {
	GetAll() ([]models.Node, error)
	GetNode(path string) (models.Node, error)
	CreateNode(path string, node models.Node) error
	UpdateNode(path string, node models.Node) error
	DeleteNode(path string, node models.Node) error
}

type fileSystemRepository struct {
	root string
}

func NewFileSystemRepository(root string) Repository {
	return &fileSystemRepository{
		root: root,
	}
}

func (repo *fileSystemRepository) GetAll() ([]models.Node, error) {
	// TODO(ea): traverse root filesystem and find all .md files
	return nil, errors.New("not implemented")
}

func (repo *fileSystemRepository) GetNode(path string) (models.Node, error) {
	return models.Node{}, errors.New("not implemented")
}

func (repo *fileSystemRepository) CreateNode(path string, node models.Node) error {
	return errors.New("not implemented")
}

func (repo *fileSystemRepository) UpdateNode(path string, node models.Node) error {
	return errors.New("not implemented")
}

func (repo *fileSystemRepository) DeleteNode(path string, node models.Node) error {
	return errors.New("not implemented")
}
