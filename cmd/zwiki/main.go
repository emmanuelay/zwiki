package main

import (
	"flag"
	"os"

	"github.com/emmanuelay/zwiki/nodes"
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
	api := server.NewApi(port, fsRepo)

	api.Serve()
}
