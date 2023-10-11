package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/emmanuelay/zwiki/nodes"
	assets "github.com/emmanuelay/zwiki/public"
	"github.com/go-chi/chi"
	"github.com/go-chi/chi/middleware"
)

type Api struct {
	port int
	repo nodes.Repository
}

func NewApi(port int, repo nodes.Repository) *Api {
	return &Api{
		port: port,
		repo: repo,
	}
}

func (api *Api) Serve() {
	var staticFS = http.FS(assets.Public)
	fs := http.FileServer(staticFS)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Route("/api", func(apiRouter chi.Router) {
		apiRouter.Get("/all", api.getAll)
		apiRouter.Get("/{slug}", api.getNode)
		apiRouter.Put("/{slug}", api.updateNode)
		apiRouter.Post("/{slug}", api.createNode)
		apiRouter.Delete("/{slug}", api.deleteNode)
	})

	r.Handle("/*", fs)

	fmt.Printf("Listning on http://localhost:%d ... \n", api.port)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", api.port), r); err != nil {
		log.Fatal(err)
	}
}

func (a *Api) getAll(w http.ResponseWriter, r *http.Request) {
	nodes, err := a.repo.GetAll(r.Context())
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("getAll failed"))
		return
	}

	content, err := json.MarshalIndent(nodes, "", "\t")
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("getAll json marshalling failed"))
		return
	}

	w.Write([]byte(string(content)))
}

func (a *Api) getNode(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("getNode"))
}

func (a *Api) updateNode(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("updateNode"))
}

func (a *Api) createNode(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("createNode"))
}

func (a *Api) deleteNode(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("deleteNode"))
}
