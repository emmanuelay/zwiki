BINARY_NAME=zwiki
BUILD_DIR=./tmp

.DEFAULT_GOAL := help

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-10s %s\n", $$1, $$2}'

build: ## Build the binary
	go build -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/zwiki

run: build ## Build and run the server
	$(BUILD_DIR)/$(BINARY_NAME) -path ./tests -port 1337

test: ## Run all tests
	go test ./...

develop: ## Run with hot reload
	air