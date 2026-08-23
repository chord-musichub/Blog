# v20.18.5 打字练习：中文输入法、文章长度、复制粘贴限制

## 修复 1：中英混打模式输入法问题

问题：

在中文输入法下输入中英混打文章时，英文还没有正式提交进输入框，页面就提前判定后续字符错误，显示红色。

修复：

- 新增 `compositionstart`
- 新增 `compositionend`
- 输入法组合过程中不提前更新判定
- 等输入法正式提交文本后再重新比较

## 修复 2：文章长度加长

英文和中文 / 中英混打文章池都加长为更完整的段落。  
当前仍使用内置文章池随机抽取，不接外部动态资源。

## 修复 3：禁止复制粘贴更彻底

新增拦截：

- paste
- copy
- cut
- drop
- dragover
- contextmenu
- beforeinput 的 paste / drop
- Ctrl / Cmd + V
- Ctrl / Cmd + X
- Ctrl / Cmd + C

同时模板输入框补充：

- autocomplete=off
- autocorrect=off
- autocapitalize=off
- spellcheck=false
- inputmode=text

## 影响范围

只修改打字练习工具。  
不修改 2048、反应测试、管道鸟、贪吃蛇。
