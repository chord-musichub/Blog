FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
COPY vendor ./vendor
COPY . .
# Compile from checked-in dependencies, even on hosts without Go proxy access.
RUN --network=none go build -mod=vendor -o /blog-admin ./cmd/server

FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache hugo
COPY --from=build /blog-admin /app/blog-admin
COPY frontend /app/frontend
EXPOSE 8080
CMD ["/app/blog-admin"]
