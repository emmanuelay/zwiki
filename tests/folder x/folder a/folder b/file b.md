---
title: Go Patterns
tags: golang, patterns, reference
author: Emmanuel
---
# Go Patterns

## Repository Pattern

The repository pattern abstracts data access behind an interface. This makes it easy to swap implementations (filesystem, database, etc.) without changing business logic.


```go
type Repository interface {
    GetAll(ctx context.Context) ([]Item, error)
    GetByID(ctx context.Context, id string) (Item, error)
}
```

## Embedding

Go uses composition over inheritance. Embed structs to reuse behavior:

```go
type Base struct {
    ID string
}

type Extended struct {
    Base
    Name string
}
```
