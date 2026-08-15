# 歌词系统架构

MusicBox 的歌词管线以 TTML 作为唯一 canonical 表示，并使用 AMLL Core 作为播放详情页唯一歌词渲染器。来源原始格式只存在于采集与归一化边界内，不会成为长期运行时模型或持久化格式。

## 数据流

```text
本地 / 内嵌 / bundled provider
          │
          ▼
TTML / LRC / YRC / QRC / KRC payload
          │
          ▼
LyricsNormalizer
          │
          ├── 完整 TTMLResult（编辑真相）
          ├── AMLL render projection（渲染视图）
          └── canonical TTML 文本（持久化）
                         │
                         ▼
                    AMLL Core
```

- TTML、LRC、YRC、QRC 使用 AMLL 官方 parser；KRC 是唯一的私有格式适配器，解析后立即生成 TTML。
- LRC 只保留行级时间，不伪造逐字时间。
- 翻译和音译按时间轴单调匹配，无法可靠匹配的辅助行不会通过文本猜测强行合并。
- Ruby、背景声、对唱、agent 和 metadata 保留在完整 TTML 结构中；渲染投影可以从它重新生成。

## 模块职责

- `features/lyrics/domain/`：canonical 文档、来源、候选和查询类型。
- `features/lyrics/format/`：AMLL 格式归一化、辅助歌词合并和 KRC 适配。
- `features/lyrics/providers/`：内部 provider SPI，以及 AMLL、网易、QQ、酷狗四个内置实现。
- `features/lyrics/sources/`：本地与内嵌歌词入口。
- `features/lyrics/service/`：自动加载顺序、搜索会话、取消和应用候选。
- `features/lyrics/ui/`：AMLL Core 生命周期与统一来源选择器。
- `src/main/services/LyricsPersistenceService.ts`：canonical TTML 和歌曲绑定持久化。

Renderer 不直接访问文件系统。canonical 文件和绑定通过 preload 暴露的歌词 IPC 访问，存放在 Electron `userData/lyrics/` 下。`canonical/` 保存 TTML，`bindings.json` 保存来源和歌曲绑定；清除绑定不会删除 canonical 文件。

## 来源优先级与手动绑定

自动加载顺序为：已绑定 canonical、本地同名歌词、音频内嵌歌词、内置在线 provider。四个 provider 统一实现 `search` 与 `fetch`，并接受 `AbortSignal`；切歌或关闭选择器时会取消旧请求，单个 provider 失败不会中断播放或其他来源。

手动选择候选会保存 `manuallySelected` binding，并立即刷新当前歌词。该绑定优先于自动匹配，只有用户执行“清除绑定”或“重新自动匹配”后才退出。统一来源选择器可从单曲右键菜单和播放详情歌词区域右键菜单进入，并按当前、本地、内嵌及四个 provider 分栏显示独立加载与错误状态。

## 后续编辑能力

未来时间轴纠错、Ruby 修改和自动日文注音应直接变换完整 TTML 文档，再序列化回同一 canonical 文件。不要从 AMLL DOM 反推歌词，也不要建立长期 override 数据库或第二套增强歌词格式。

## 验证清单

自动检查：

- 渲染进程单元测试，覆盖 TTML/LRC/YRC/QRC/KRC、辅助轨合并、候选匹配、provider mock、绑定优先级和 AMLL 同步。
- 渲染进程生产构建与架构边界检查。
- 主进程 TypeScript 构建。

发布前仍需在受影响平台手动验证：

- 中文普通 LRC、日文逐字 TTML + Ruby、romanization、translation、背景声、对唱。
- 网易 YRC、QQ QRC、酷狗 KRC，以及无歌词和只有行级时间的歌词。
- seek、暂停/恢复、切歌、重复行、长歌词、窗口缩放和歌词不可用状态。
- 两个右键入口、各来源独立 loading/error、预览、应用、当前绑定标记、清除绑定和即时刷新。
- Windows 桌面歌词与迷你模式；macOS/Linux Web Audio 回退路径不依赖 WASAPI 或 `NativeAudio.node`。

