# v20.18.5 本地音频进度条与来源卡片布局优化

## 优化 1：本地音频进度条可拖动跳转

歌曲信息卡里的进度条新增：

- 点击跳转
- 拖动跳转
- 键盘左右方向键微调
- Home / End 跳到开头 / 结尾
- hover / focus / drag 时显示拖动圆点

只对本地上传音频生效。网页登录系统声音没有可控播放源，因此不支持 seek。

## 优化 2：正式播放后边框保持圆角

live 状态下 `.av-stage` / `.av-canvas` 重新强制：

- border-radius
- overflow hidden
- round clip-path

避免正式进入播放后视觉区域变回方形。

## 优化 3：初始两个来源卡片居中对称

本地助手移除后，来源卡只剩两张。  
本版改为两列居中布局，不再偏在左边：

```css
grid-template-columns: repeat(2, minmax(280px, 440px));
justify-content: center;
```
