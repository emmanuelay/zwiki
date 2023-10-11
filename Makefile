BINARY_NAME=zwiki

build:
	GOARCH=amd64 GOOS=darwin go build -o ${BINARY_NAME}-darwin cmd/zwiki/main.go

run: build
	./${BINARY_NAME}-darwin

clean:
	go clean
	rm ${BINARY_NAME}-darwin
