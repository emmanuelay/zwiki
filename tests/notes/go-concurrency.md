---
title: Go Concurrency
tags: golang, concurrency, reference
---

# Go Concurrency

Go was designed with concurrency as a first-class citizen. This guide covers the key primitives and patterns for writing concurrent programs in Go.

## Goroutines

A goroutine is a lightweight thread managed by the Go runtime. They are cheap to create — you can easily spin up thousands of them.

```go
go func() {
    fmt.Println("Hello from a goroutine")
}()
```

Goroutines run in the same address space, so access to shared memory must be synchronized. The Go motto is: "Don't communicate by sharing memory; share memory by communicating."

### Goroutine Lifecycle

A goroutine runs until its function returns. There is no way to forcibly kill a goroutine from the outside — you must design your goroutines to respond to cancellation signals.

### Goroutine Leaks

A common pitfall is creating goroutines that never terminate. This happens when a goroutine is blocked on a channel that will never receive a value, or when it's waiting for a lock that will never be released.

Always ensure your goroutines have a clear exit path. Use context cancellation or done channels to signal when work should stop.

## Channels

Channels are the primary mechanism for communication between goroutines. They provide a way to send and receive values with the channel operator `<-`.

```go
ch := make(chan int)

go func() {
    ch <- 42
}()

value := <-ch
fmt.Println(value) // 42
```

### Buffered Channels

By default, channels are unbuffered — sends block until a receiver is ready. Buffered channels have a capacity and only block when the buffer is full.

```go
ch := make(chan int, 5)
ch <- 1 // doesn't block
ch <- 2 // doesn't block
```

### Channel Direction

You can specify whether a channel is send-only or receive-only in function signatures. This provides compile-time safety.

```go
func producer(out chan<- int) {
    out <- 42
}

func consumer(in <-chan int) {
    value := <-in
    fmt.Println(value)
}
```

### Closing Channels

A sender can close a channel to signal that no more values will be sent. Receivers can check whether a channel has been closed.

```go
close(ch)

value, ok := <-ch
if !ok {
    fmt.Println("channel closed")
}
```

## Select Statement

The `select` statement lets a goroutine wait on multiple channel operations. It blocks until one of its cases can proceed.

```go
select {
case msg := <-ch1:
    fmt.Println("received from ch1:", msg)
case msg := <-ch2:
    fmt.Println("received from ch2:", msg)
case <-time.After(5 * time.Second):
    fmt.Println("timeout")
}
```

### Non-blocking Operations

Adding a `default` case makes the select non-blocking.

```go
select {
case msg := <-ch:
    fmt.Println(msg)
default:
    fmt.Println("no message available")
}
```

## Sync Package

The `sync` package provides traditional synchronization primitives for cases where channels are not the best fit.

### Mutex

A `sync.Mutex` provides mutual exclusion. Only one goroutine can hold the lock at a time.

```go
var mu sync.Mutex
var count int

mu.Lock()
count++
mu.Unlock()
```

### WaitGroup

A `sync.WaitGroup` waits for a collection of goroutines to finish.

```go
var wg sync.WaitGroup

for i := 0; i < 5; i++ {
    wg.Add(1)
    go func(n int) {
        defer wg.Done()
        fmt.Println("worker", n)
    }(i)
}

wg.Wait()
```

### Once

`sync.Once` ensures a function is only executed once, regardless of how many goroutines call it.

```go
var once sync.Once

once.Do(func() {
    fmt.Println("this runs only once")
})
```

## Context

The `context` package provides a way to carry deadlines, cancellation signals, and request-scoped values across API boundaries and between goroutines.

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

select {
case <-time.After(10 * time.Second):
    fmt.Println("finished work")
case <-ctx.Done():
    fmt.Println("cancelled:", ctx.Err())
}
```

### Context Best Practices

- Pass context as the first parameter of functions
- Never store context in a struct
- Use `context.TODO()` when unsure which context to use
- Always call the cancel function to release resources

## Common Patterns

### Fan-out, Fan-in

Fan-out is when you start multiple goroutines to handle input from a single channel. Fan-in is when you combine multiple channels into one.

```go
func fanOut(input <-chan int, workers int) []<-chan int {
    channels := make([]<-chan int, workers)
    for i := 0; i < workers; i++ {
        channels[i] = process(input)
    }
    return channels
}
```

### Pipeline

A pipeline is a series of stages connected by channels, where each stage is a group of goroutines running the same function.

```go
func generator(nums ...int) <-chan int {
    out := make(chan int)
    go func() {
        for _, n := range nums {
            out <- n
        }
        close(out)
    }()
    return out
}

func square(in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        for n := range in {
            out <- n * n
        }
        close(out)
    }()
    return out
}
```

### Worker Pool

A worker pool limits the number of concurrent goroutines processing work.

```go
func workerPool(jobs <-chan int, results chan<- int, workers int) {
    var wg sync.WaitGroup
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for job := range jobs {
                results <- process(job)
            }
        }()
    }
    wg.Wait()
    close(results)
}
```

## Summary

Concurrency in Go is built around a few simple primitives — goroutines, channels, and the select statement. The standard library provides additional tools through the `sync` and `context` packages. Master these building blocks and you can write clean, efficient concurrent programs.
