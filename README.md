# PATHLAB · A* 算法实践

[A* 路径规划交互实验台](https://6ks6nmzs98-max.github.io/a-star-pathlab/)

支持 A*、Dijkstra、BFS 同图对比，障碍绘制、起终点设置、逐步回放、速度控制与启发式倍率调整。

## 功能

- 36 × 22 可编辑网格
- A* / Dijkstra / BFS
- 开放集、关闭集、当前节点与最终路径可视化
- 播放、暂停、单步、回退和重置
- 启发式倍率实验
- 同图算法结果对比
- 桌面与移动端响应式布局

## 本地运行

`powershell
python -m http.server 8080 --bind 127.0.0.1
`

打开 http://127.0.0.1:8080/

图标使用 Lucide，ISC License。