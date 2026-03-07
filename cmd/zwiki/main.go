package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"github.com/emmanuelay/zwiki/nodes"
	"github.com/emmanuelay/zwiki/search"
	"github.com/emmanuelay/zwiki/server"
)

func main() {
	var port int
	var path string

	flag.IntVar(&port, "port", 1337, "Port to publish the api & web interface")
	flag.StringVar(&path, "path", "./", "Root path of the wiki")
	flag.Parse()

	if len(path) == 0 || port < 80 {
		flag.PrintDefaults()
		os.Exit(1)
	}

	fsRepo := nodes.NewFileSystemRepository(path)

	searchIndex, err := search.NewIndex()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to create search index: %v\n", err)
		os.Exit(1)
	}

	folder, err := fsRepo.GetAll(context.Background())
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load nodes for indexing: %v\n", err)
		os.Exit(1)
	}

	if err := searchIndex.BuildFromFolder(folder, fsRepo); err != nil {
		fmt.Fprintf(os.Stderr, "failed to build search index: %v\n", err)
		os.Exit(1)
	}

	api := server.NewApi(port, fsRepo, searchIndex)
	api.Serve()
}
