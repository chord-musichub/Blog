# v20.18.5 音频可视化空页面与返回键修复

## 修复 1：可视化空页面

v20.17.7 删除了右上角 `停止` 按钮，但 JS 里残留了：

```js
if(stopBtn){
  stopBtn.addEventListener(...)
}
```

由于 `stopBtn` 变量已经不存在，页面初始化时直接 `ReferenceError`，导致音频可视化启动失败。

本版彻底删除 `stopBtn` 相关 JS 残留。

## 修复 2：返回键跳工具页

返回键现在点击时会：

1. `event.preventDefault()`
2. 执行 `stopAll()`
3. `window.location.href = '/tools/'`

因此不会只回到音频可视化初始界面，而是直接返回工具页。

## 保持

- 右上角仍然没有“停止”按钮
- 返回键外观仍然保持小圆形原样
- 点击返回键会先停止本地音频 / 浏览器音频流
