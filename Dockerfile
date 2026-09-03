FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod ./
COPY . .
RUN go build -o /blog-admin ./cmd/server

FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache hugo
COPY --from=build /blog-admin /app/blog-admin
COPY web /app/web
COPY hugo.toml /app/hugo.toml
COPY layouts /app/layouts
COPY assets /app/assets
COPY static /app/static
COPY content /app/content
EXPOSE 8080
CMD ["/app/blog-admin"]
