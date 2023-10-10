package nodes

import (
	"errors"

	"github.com/emmanuelay/zwiki/models"
)

type Repository interface {
	getAll() ([]models.Node, error)
	getNode(path string) (models.Node, error)
	createNode(path string, node models.Node) error
	updateNode(path string, node models.Node) error
	deleteNode(path string, node models.Node) error
}

type fileSystemRepository struct {
	root string
}

func NewFileSystemRepository(root string) Repository {
	return &fileSystemRepository{
		root: root,
	}
}

func (repo *fileSystemRepository) getAll() ([]models.Node, error) {
	return nil, errors.New("not implemented")
}

func (repo *fileSystemRepository) getNode(path string) (models.Node, error) {
	return models.Node{}, errors.New("not implemented")
}

func (repo *fileSystemRepository) createNode(path string, node models.Node) error {
	return errors.New("not implemented")
}

func (repo *fileSystemRepository) updateNode(path string, node models.Node) error {
	return errors.New("not implemented")
}

func (repo *fileSystemRepository) deleteNode(path string, node models.Node) error {
	return errors.New("not implemented")
}
