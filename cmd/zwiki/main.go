package main

import (
	"github.com/emmanuelay/zwiki/nodes"
	"github.com/emmanuelay/zwiki/server"
)

func main() {
	fsRepo := nodes.NewFileSystemRepository("./")
	api := server.NewApi(8080, fsRepo)

	api.Serve()
}
