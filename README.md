# ZWiki

A lightweight, web-based wiki for browsing and editing markdown files on your local filesystem. Inspired by the Zettelkasten method, it uses tags and wiki-links for navigation between documents.

Use it to navigate documentation in a software project or maintain a personal knowledge base.

## Features

- **Tree view** — Browse your markdown folder structure with collapsible folders
- **Markdown viewer** — Rendered HTML with support for headings, code blocks, tables, task lists, images, and more
- **Editor** — In-browser markdown editing with live outline updates
- **Frontmatter** — YAML frontmatter parsing and a dedicated key-value editor
- **Wiki-links** — `[[link]]` syntax to connect documents by title or filename
- **Tags** — Clickable tag chips that search for all documents sharing a tag
- **Document outline** — Auto-generated heading tree for quick navigation
- **Dark mode** — Toggle with persistent preference via localStorage
- **Natural sort** — Files and folders sorted naturally (e.g. `2` before `10`)
- **Hot reload** — Development with [Air](https://github.com/air-verse/air) for automatic rebuilds

## Getting started

### Prerequisites

- Go 1.26+
- [Air](https://github.com/air-verse/air) (optional, for hot reload during development)

### Build and run

```sh
# Build the binary
make build

# Run against a folder of markdown files
make run

# Or run directly
./zwiki -path /path/to/your/wiki -port 1337
```

### Development

```sh
# Hot reload with Air (default: ./tests folder on port 1337)
make develop

# Override arguments
make develop ARGS="-path ~/wiki -port 8080"
```

### Options

| Flag    | Default | Description                          |
|---------|---------|--------------------------------------|
| `-path` | `./`    | Root path of the markdown folder     |
| `-port` | `1337`  | Port for the web interface and API   |

### Available commands

```
make help       Show available commands
make build      Build the binary
make run        Build and run the server
make test       Run all tests
make develop    Run with hot reload
```

## Frontmatter

Documents can include YAML frontmatter for metadata:

```markdown
---
title: My Document
tags: golang, wiki
author: Jane Doe
---

# My Document

Content goes here...
```

The `title` field is used in the tree view and header. The `tags` field enables tag-based search and navigation.

## Wiki-links

Link between documents using double-bracket syntax:

```markdown
See [[My Document]] for details.
```

Links resolve by matching the frontmatter `title` first, then the filename (without extension). Unresolved links are displayed as broken links.

## Tech stack

- **Backend** — Go with [chi](https://github.com/go-chi/chi) router
- **Frontend** — Vanilla JS, [Tailwind CSS](https://tailwindcss.com) (CDN), [marked.js](https://marked.js.org) for markdown rendering
- **Frontmatter** — [adrg/frontmatter](https://github.com/adrg/frontmatter)
- **Static assets** — Embedded via Go's `embed.FS`
