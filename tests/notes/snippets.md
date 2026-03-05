---
tags: code, reference, golang
title: Code Snippets
author: Emmanuel Ay
---
# Code Snippets

## Read a file in Go

```go
data, err := os.ReadFile("path/to/file.md")
if err != nil {
    log.Fatal(err)
}
fmt.Println(string(data))
```

## Simple HTTP server

```go
http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
    fmt.Fprintf(w, "Hello, World!")
})
log.Fatal(http.ListenAndServe(":8080", nil))
```

## Walk a directory

```go
filepath.WalkDir(".", func(path string, d fs.DirEntry, err error) error {
    if !d.IsDir() {
        fmt.Println(path)
    }
    return nil
})
```
