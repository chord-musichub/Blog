# 可重复的 Go 依赖构建

`golang.org/x/image v0.24.0` 中实际使用的 `draw`、`math/f64` 包通过 `go mod vendor` 生成在 `vendor/`；保留上游 LICENSE、PATENTS 及版本清单。没有更换版本、重写算法或关闭完整性校验。

Docker 编译阶段使用 `RUN --network=none go build -mod=vendor`；服务器 Git 发布及发布包脚本也使用 `-mod=vendor`。不需要通过反复切换 Go 下载源解决日常编译问题。

维护依赖时，在可以访问模块站点的开发环境中执行：

```sh
go mod download
go mod verify
go mod vendor
go test -mod=vendor ./...
```

将 `go.mod`、`go.sum`、整个 `vendor/` 和相关源码一起纳入版本控制。更新依赖时必须重新生成 vendor，不能手改库文件。`go mod verify` 验证的是下载缓存，并不验证后来手动改过的 vendor 文件，因此应从已校验的缓存生成，再检查生成差异。

离线编译回归（不要求已有模块缓存）：

```sh
dependency_test_dir=$(mktemp -d /tmp/blog-offline-test.XXXXXX)
GOPROXY=off GOTOOLCHAIN=local GOMODCACHE="$dependency_test_dir/modcache" \
  go test -mod=vendor ./...
GOPROXY=off GOTOOLCHAIN=local GOMODCACHE="$dependency_test_dir/modcache" \
  go build -mod=vendor -buildvcs=false -trimpath -ldflags='-s -w' \
  -o "$dependency_test_dir/blog-admin" ./cmd/server
```

这是 **Go 依赖无需下载**，不是整套部署完全离线：Docker Hub 基础镜像、`apk add hugo`、GitHub 拉源码，以及首次安装编译工具仍依赖相应网络。原来的构建代理配置仅作为这些网络环节的可选补充，不改变运行时网络或 8080 端口。

参考：[Go 官方 vendoring 文档](https://go.dev/ref/mod#vendoring)。
