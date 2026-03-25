package watcher

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/emmanuelay/zwiki/nodes"
	"github.com/emmanuelay/zwiki/search"
	"github.com/fsnotify/fsnotify"
)

type Watcher struct {
	fsWatcher *fsnotify.Watcher
	rootDir   string
	repo      nodes.Repository
	search    *search.Index

	clients   map[chan string]struct{}
	clientsMu sync.RWMutex

	debounceMu    sync.Mutex
	debounceTimer *time.Timer

	done chan struct{}
}

func New(rootDir string, repo nodes.Repository, searchIndex *search.Index) (*Watcher, error) {
	absRoot, err := filepath.Abs(rootDir)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve root dir: %w", err)
	}

	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("failed to create fsnotify watcher: %w", err)
	}

	w := &Watcher{
		fsWatcher: fsw,
		rootDir:   absRoot,
		repo:      repo,
		search:    searchIndex,
		clients:   make(map[chan string]struct{}),
		done:      make(chan struct{}),
	}

	if err := w.addRecursive(absRoot); err != nil {
		fsw.Close()
		return nil, fmt.Errorf("failed to watch directories: %w", err)
	}

	go w.loop()

	return w, nil
}

func (w *Watcher) addRecursive(root string) error {
	return filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() {
			return nil
		}
		name := d.Name()
		if strings.HasPrefix(name, ".") || name == "node_modules" {
			return filepath.SkipDir
		}
		return w.fsWatcher.Add(path)
	})
}

func (w *Watcher) loop() {
	for {
		select {
		case event, ok := <-w.fsWatcher.Events:
			if !ok {
				return
			}
			if w.isRelevant(event) {
				w.scheduleRefresh(event)
			}
		case err, ok := <-w.fsWatcher.Errors:
			if !ok {
				return
			}
			log.Printf("watcher error: %v", err)
		case <-w.done:
			return
		}
	}
}

func (w *Watcher) isRelevant(event fsnotify.Event) bool {
	name := filepath.Base(event.Name)

	// Ignore hidden files/dirs
	if strings.HasPrefix(name, ".") {
		return false
	}

	// Directory events are relevant (new/removed folders)
	if event.Has(fsnotify.Create) {
		if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
			// Watch new subdirectory
			w.fsWatcher.Add(event.Name)
			return true
		}
	}

	// Only care about .md files for non-directory events
	if filepath.Ext(event.Name) == ".md" {
		return true
	}

	// Directory removal
	if event.Has(fsnotify.Remove) || event.Has(fsnotify.Rename) {
		return true
	}

	return false
}

func (w *Watcher) scheduleRefresh(_ fsnotify.Event) {
	w.debounceMu.Lock()
	defer w.debounceMu.Unlock()

	if w.debounceTimer != nil {
		w.debounceTimer.Stop()
	}

	w.debounceTimer = time.AfterFunc(300*time.Millisecond, func() {
		w.handleChange()
	})
}

func (w *Watcher) handleChange() {
	folder, err := w.repo.GetAll(context.Background())
	if err != nil {
		log.Printf("watcher: failed to reload tree: %v", err)
		return
	}

	if err := w.search.Rebuild(folder, w.repo); err != nil {
		log.Printf("watcher: failed to rebuild search index: %v", err)
	}

	w.broadcast("tree-changed")
}

func (w *Watcher) Subscribe() chan string {
	ch := make(chan string, 8)
	w.clientsMu.Lock()
	w.clients[ch] = struct{}{}
	w.clientsMu.Unlock()
	return ch
}

func (w *Watcher) Unsubscribe(ch chan string) {
	w.clientsMu.Lock()
	delete(w.clients, ch)
	w.clientsMu.Unlock()
}

func (w *Watcher) broadcast(eventType string) {
	w.clientsMu.RLock()
	defer w.clientsMu.RUnlock()

	for ch := range w.clients {
		select {
		case ch <- eventType:
		default:
			// Client channel full, skip to avoid blocking
		}
	}
}

func (w *Watcher) Close() error {
	close(w.done)

	w.clientsMu.Lock()
	for ch := range w.clients {
		close(ch)
		delete(w.clients, ch)
	}
	w.clientsMu.Unlock()

	w.debounceMu.Lock()
	if w.debounceTimer != nil {
		w.debounceTimer.Stop()
	}
	w.debounceMu.Unlock()

	return w.fsWatcher.Close()
}
