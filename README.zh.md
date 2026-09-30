# dsh-plugin-image-gen

在 DeepSeek Harness（DSH）里通过**你自己配置的任意 OpenAI 兼容生图端点**生成图片。插件不绑定任何中转站、不预设厂商模型名单，也**不携带任何凭据**——这三样都由你提供。

插件注册两个 agent 工具：

| 工具 | 作用 |
|---|---|
| <code>generate_image</code> | 按提示词生成图片并落盘，返回绝对路径。 |
| <code>get_image_gen_config</code> | 查看当前生效配置与配置诊断（绝不显示密钥）。 |

## 你需要准备什么

- 一个带工具服务的 DSH（桌面版或 CLI 均可）。已在 DSH Desktop 0.2.0-rc.2 上验证。
- 一个符合 OpenAI 图片 API 的端点：<code>POST {baseURL}/images/generations</code>，返回 <code>data[].b64_json</code> 或 <code>data[].url</code>。OpenAI 本身以及绝大多数中转站/网关都符合。
- 该端点的 API key。

除此以外什么都不用装：不需要系统 Node、没有第三方依赖、没有构建步骤。

## 安装

在 DSH 的 **Plugins（插件）** 页面里：

- **最新版**：<code>github:HaoyanZhang123/dsh-plugin-image-gen</code>
- **锁定版本**：<code>github:HaoyanZhang123/dsh-plugin-image-gen#v0.1.2</code>
- **离线安装**：从 Releases 页下载 <code>.tgz</code>，粘贴其绝对路径
- **npm**（若你偏好从 registry 安装）：<code>dsh-plugin-image-gen</code>

全新安装立即生效——下一轮对话就能用这两个工具。**升级**已安装版本是唯一会被 DSH 标记为 <code>restart-required</code> 的情况：装完后完全退出并重开 DSH（关窗口不算退出，要从托盘图标退出）。

## 配置

### 第 1 步：找到你的 DSH 主目录

所有配置都在这里。可以让 agent 运行 <code>get_image_gen_config</code>，它会打印出确切的路径（看 "Config file" 那一行）。或者自己确认：

| 平台 | 默认 DSH 主目录 |
|---|---|
| Windows | <code>%USERPROFILE%\.dsh</code>（例如 <code>C:\Users\你的用户名\.dsh</code>） |
| macOS / Linux | <code>~/.dsh</code> |
| 任意平台（若设置了） | <code>DSH_HOME</code> 指向的路径 |

### 第 2 步：添加你的 API key

三种方式任选：

- 在 <code>&lt;DSH 主目录&gt;/.credentials.yaml</code> 已有的 <code>refs:</code> 段下添加：
  ~~~yaml
  refs:
    IMAGE_GEN_API_KEY: your-api-key-here
  ~~~
- 或者在启动 DSH 的环境里导出 <code>IMAGE_GEN_API_KEY</code> 环境变量。
- 或者在 <code>&lt;DSH 主目录&gt;/.env</code> 里写 <code>IMAGE_GEN_API_KEY=your-api-key-here</code>。

解析顺序与 DSH 官方一致：进程环境变量 &gt; <code>.credentials.yaml</code> 的 refs &gt; <code>&lt;工作目录&gt;/.env</code> &gt; <code>&lt;DSH 主目录&gt;/.env</code>。

密钥**绝不会**从对话中读取、不会出现在工具输出里，也不会被本插件存储。**不要把 key 粘进聊天消息**——放进上面三个位置之一。

### 第 3 步：指向你的端点

新建 <code>&lt;DSH 主目录&gt;/image-gen.config.json</code>：

~~~json
{
  "baseURL": "https://your-relay.example.com/v1",
  "apiKeyEnv": "IMAGE_GEN_API_KEY",
  "models": ["gpt-image-1", "another-model"],
  "defaultModel": "gpt-image-1"
}
~~~

对大多数人来说这就配置完了。如果你直接用 OpenAI 默认值，**这一步可以整个跳过**，只做第 2 步即可。

两个实用提醒：

- <code>baseURL</code> 是 <code>/images/generations</code> **之前**的那一段。如果你的网关地址是 <code>https://gw.example.com/openai/v1/images/generations</code>，那么 <code>baseURL</code> 填 <code>https://gw.example.com/openai/v1</code>。
- Windows 上 JSON 里的路径要写双反斜杠（<code>"E:\\images"</code>）或直接用正斜杠（<code>"E:/images"</code>）。

改动在下一次工具调用时生效，无需重启。

### 第 4 步：验证

让 agent 运行 <code>get_image_gen_config</code>。应该看到你的端点、模型列表，以及 <code>Resolved keys: 1</code>（或更多）。然后说一句"画一只桌上的红苹果"，检查返回的路径文件是否真的存在。

## 使用方式

直接描述你想要的图。覆盖参数按自然语言表达、逐次生效：

- "画一只在代码里游泳的猫"
- "做一张 16:9 的发布会横幅"——agent 会传对应的 <code>size</code>
- "出 4 个版本的 logo"——<code>n=4</code>
- "这张用 another-model"——单次覆盖模型

图片以 PNG 落盘并按绝对路径返回，因此独立于对话存在。想在对话里直接看图需要当前模型支持图像输入，否则打开文件即可。

## 配置项说明

| 字段 | 默认值 | 含义 |
|---|---|---|
| <code>baseURL</code> | <code>https://api.openai.com/v1</code> | 任意 OpenAI 兼容基础地址；会 POST 到 <code>/images/generations</code>。 |
| <code>apiKeyEnv</code> | <code>IMAGE_GEN_API_KEY</code> | 凭据名，逗号分隔多个可轮换（如 <code>KEY_A,KEY_B</code>）。只存名字，不存密钥。 |
| <code>models</code> | <code>["gpt-image-1"]</code> | 展示给 agent 的模型名单；调用时可传任意 id。 |
| <code>defaultModel</code> | <code>models</code> 第一项 | 调用未指定 <code>model</code> 时使用。 |
| <code>defaultParams</code> | <code>{}</code> | 合并进每次请求的额外字段——各家私有参数（如 <code>aspect_ratio</code>、<code>style</code>）的总出口。 |
| <code>timeoutMs</code> | <code>240000</code> | 单次请求超时。 |
| <code>outputDir</code> | <code>&lt;DSH 主目录&gt;/image-gen/output</code> | 图片保存目录；单次调用的 <code>output_dir</code> 可覆盖。 |
| <code>proxy</code> | <code>auto</code> | <code>auto</code>（沿用环境代理，否则探测系统代理：Windows 注册表 / macOS scutil）、<code>off</code>，或显式 <code>http://host:port</code>。 |

优先级：包内默认 &lt; profile patch 里条目的可选 <code>config:</code> 块 &lt; <code>image-gen.config.json</code>。

<code>size</code> 与 <code>quality</code> 是**透传字符串**：只有你显式设置（单次调用或 <code>defaultParams</code>）才会发送，否则由端点使用自身默认值。各家取值词汇不同，插件不做校验，端点报错会原文返回给模型以便重试。

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| <code>No API key found for "IMAGE_GEN_API_KEY"</code> | 第 2 步没做，或者 key 的名字和 <code>apiKeyEnv</code> 不一致。运行 <code>get_image_gen_config</code> 看它找了哪些名字。 |
| <code>Configuration warnings: ... invalid JSON</code> | 配置文件解析失败已被忽略，当前用的是默认值。检查 JSON 是否合法（注意 Windows 反斜杠）。 |
| <code>upstream HTTP 401</code> | 端点拒绝了密钥（key 错误、账号不对，或用了别的网关的 key）。 |
| <code>upstream HTTP 404</code> | <code>baseURL</code> 写错了——通常是 <code>/v1</code> 多写或少写。实际请求地址是 <code>{baseURL}/images/generations</code>。 |
| <code>upstream HTTP 429</code> | 被限流。给 <code>apiKeyEnv</code> 加第二个 key（<code>KEY_A,KEY_B</code>）；插件会在 401/429 时自动轮换。 |
| <code>upstream returned no image data</code> | 端点有响应但不是 OpenAI 图片格式（<code>data[].b64_json</code> / <code>data[].url</code>），即不兼容。 |
| 请求超时 | 调大 <code>timeoutMs</code>。大尺寸、高质量出图可能要几分钟。 |
| 代理环境下连接失败 | 保持 <code>proxy: "auto"</code>，或显式填写代理 URL（需要认证就把凭据写进去）。需要认证的系统代理不会被自动识别。 |

其他情况：端点返回的报错原文会透传给你，<code>get_image_gen_config</code> 会报告生效配置和配置文件路径。

## 安全说明

- 发布包内除中性的 OpenAI 默认地址外不含任何端点，也不含任何凭据；package.json 的 <code>files</code> 白名单限定了打包内容。
- 发布前 <code>npm run pack:check</code> 会打包并扫描每个文件的密钥形态字符串。
- API key 只从你自己的凭据存储解析，绝不出现在日志、工具输出或报错中。

## 兼容性与故障行为

详见 COMPATIBILITY.md。要点：插件只依赖 Node 内置模块和文档化的工具注册契约，**不声明任何 DSH 版本门禁**，契约若变则响亮且局部地失败。已在 Windows 上的 DSH Desktop 0.2.0-rc.2 验证；macOS 使用同一套契约（系统代理探测已有单测覆盖）。

## 卸载

在 Plugins 页面移除本 bundle 即可。你的 <code>image-gen.config.json</code>、已生成图片和凭据都不会被改动。

## 维护者须知

~~~bash
node --test                  # 37 个测试
node tools/check-package.mjs # 白名单检查 + 密钥泄漏扫描，然后打包
~~~

发版流程：改 package.json 的 <code>version</code> → 写 CHANGELOG → 跑上面两条命令 → 提交 → <code>gh release create vX.Y.Z dsh-plugin-image-gen-X.Y.Z.tgz</code>。
