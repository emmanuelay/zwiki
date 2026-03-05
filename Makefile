BINARY_NAME=zwiki

.DEFAULT_GOAL := help

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-10s %s\n", $$1, $$2}'

build: ## Build the binary
	go build -o $(BINARY_NAME) ./cmd/zwiki

run: build ## Build and run the server
	./$(BINARY_NAME) -path ./tests -port 1337

test: ## Run all tests
	go test ./...

develop: ## Run with hot reload (ARGS override, e.g. make develop ARGS="-path ~/wiki -port 8080")
	@command -v air >/dev/null 2>&1 || { $(MAKE) doctor; exit 1; }
	air -- $(ARGS)

doctor: ## Check that required tools are installed
	@echo "Checking dependencies..."
	@command -v go >/dev/null 2>&1 && echo "  go: $$(go version)" || echo "  go: NOT INSTALLED"
	@command -v air >/dev/null 2>&1 && echo "  air: installed" || echo "  air: NOT INSTALLED (go install github.com/air-verse/air@latest)"