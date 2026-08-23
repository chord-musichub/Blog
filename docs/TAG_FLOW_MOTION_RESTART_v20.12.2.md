# v20.18.5 标签漂流带运动循环修复

## 问题

v20.12.1 后，标签页内容存在，但漂流带不再移动。

## 根因

v20.12.1 给 `tag-flow.js` 加了 AJAX 切页后的重新初始化。  
但旧的 `startTagRiverMotion(stage)` 使用了：

```js
stage.__tagRiverMotionStarted = true
```

重新初始化时会发生：

1. `renderRiver(tags)` 清空并重建漂流带 DOM
2. 新的 `.tag-river-strip-seamless` 被插入页面
3. 调用 `startTagRiverMotion(stage)`
4. 由于 `stage.__tagRiverMotionStarted` 仍然是 true，函数直接 return
5. 新 DOM 没有新的 requestAnimationFrame 循环驱动，所以不动

## 本次修复

将漂流带运动循环改为 token 模式：

```js
var token = (stage.__tagRiverMotionToken || 0) + 1;
stage.__tagRiverMotionToken = token;
```

每次重新渲染都会生成新 token。  
旧 RAF 循环发现 token 不一致后自动停止，新 RAF 循环接管新 DOM。

## 效果

- 首次打开标签页：漂流带正常移动
- 从其他页面返回标签页：漂流带正常移动
- 多次切页回来：不会叠加旧动画循环
- 旧 DOM 离开页面后，旧循环会停止
