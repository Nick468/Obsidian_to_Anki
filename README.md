# 简介
本项目由 [Obsidian_to_Anki](https://github.com/Pseudonium/Obsidian_to_Anki) fork而来
在原来代码的基础上，添加了两个功能
1. 让obsidian markdown文件中的卡片在anki的deck的结构与文件夹结构保存一致
例如："/root/hello/world.md"中的卡片会自动同步到"root::hello::world"中
2. 把id修改为block链接的形式，从而实现anki直接跳转到obsidian markdown文件对应的block
![图 1](images/5913712e835c128fdc7a12c0c0c1caa006ac7d47bf85a3a9f6c5970e37a0a948.png)  

# 本项目使用方法
将main.js和manifes.json文件替换obsidian to anki中的main.js manifes.json
在插件设置中，开启设置，并重启obsidian
具体的使用方法可以参考[Obsidian_to_Anki](https://github.com/Pseudonium/Obsidian_to_Anki)

# tip
填空题存在问题，可能会匹配bookxnote和latex公式,请使用"((?:.+\n)*(?:.*{{c.*)(?:\n(?:^.{1,3}$|^.{4}(?<!<!--).*))*)",
并只使用{{c\d:: text }}格式的填空题
推荐搭配latex-suite快速输入
# Introduction
This project was forked by [Obsidian_to_Anki](https://github.com/Pseudonium/Obsidian_to_Anki) Based on the original code, two features have been added 
1. Let the cards in the Obsidian markdown file be synchronized with the folder structure in the anki. For example, cards in "/root/hello/world.md" will be automatically synchronized to "root::hello::world". 

2.Change the id to a block link so that anki jumps directly to the corresponding block in the obsidian markdown file.
![图 2](images/1cfcb1bb28a06e354b339691fe79a5d40c32ac3d8d74a0c1a5fd1b4f554e201a.png)  

# How to use
Replace the main.js and manifes.json file with the main.js and manifes.json in Obsidian to Anki
In the plugin settings, turn on the settings and restart obsidian
For details, please refer to [Obsidian_to_Anki](https://github.com/Pseudonium/Obsidian_to_Anki).