# dsh-plugin-image-gen

在 DeepSeek Harness（DSH）里通过**你自己配置的任意 OpenAI 兼容生图端点**生成图片。插件本身不绑定任何中转站、不预设厂商模型名单，也**绝不携带任何凭据**——这三样都由你自己提供。

插件注册两个 agent 工具：

| 工具 | 作用 |
|---|---|
| <code>generate_image</code> | 按提示词生成图片并保存到磁盘，返回绝对路径。 |
| <code>get_image_gen_config</code> | 查看当前生效配置与配置诊断（绝不显示密钥）。 |

## 安装

在 DSH 的 **Plugins（插件）** 页面，用以下任一方式安装：

- npm 包名：<code>dsh-plugin-image-gen</code>
- GitHub 规格：<code>github:HaoyanZhang123/dsh-plugin-image-gen#v0.1.0</code>
- 本地 <code>.tgz</code> 或本目录的绝对路径

首次安装立即生效——安装完成后下一轮对话即可使用这两个工具，无需重启；只有**升级**已安装版本时 DSH 会提示需要重启。

## 快速开始

**第 1 步：添加 API key**（三选一）：

- 在 <code>&lt;DSH 主目录&gt;/.credentials.yaml</code> 的 <code>refs:</code> 段下添加，例如：
  ~~~yaml
  refs:
    IMAGE_GEN_API_KEY: your-api-key-here
  ~~~
- 或者在启动 DSH 的环境中导出 <code>IMAGE_GEN_API_KEY</code> 环境变量。
- 或者在 <code>&lt;DSH 主目录&gt;/.env</code> 里写 <code>IMAGE_GEN_API_KEY=your-api-key-here</code>。

解析顺序与 DSH 官方一致：进程环境变量 &gt; <code>.credentials.yaml</code> 的 refs &gt; <code>&lt;工作目录&gt;/.env</code> &gt; <code>&lt;DSH 主目录&gt;/.env</code>。密钥**绝不会**从对话中读取、不会出现在工具输出里，也不会被本插件存储。

**第 2 步：配置你的端点**——新建 <code>&lt;DSH 主目录&gt;/image-gen.config.json</code>：

~~~json
{
  "baseURL": "https://your-relay.example.com/v1",
  "apiKeyEnv": "IMAGE_GEN_API_KEY",
  "models": ["gpt-image-1", "another-model"],
  "defaultModel": "gpt-image-1"
}
~~~

修改即时生效，无需重启。可以让 agent 运行 <code>get_image_gen_config</code> 验证。

**第 3 步：生成**——直接说"画一只在代码里游泳的猫"，或带覆盖："用 another-model 画一张 16:9 的横幅，出 4 张"。

&lt;DSH 主目录&gt;：默认 <code>~/.dsh</code>，设置了 <code>DSH_HOME</code> 环境变量时以它为准。

## 配置项说明

| 字段 | 默认值 | 含义 |
|---|---|---|
| <code>baseURL</code> | <code>https://api.openai.com/v1</code> | 任意 OpenAI 兼容基础地址；插件会 POST 到 <code>/images/generations</code>。 |
| <code>apiKeyEnv</code> | <code>IMAGE_GEN_API_KEY</code> | 凭据名，逗号分隔多个可做轮换（如 <code>KEY_A,KEY_B</code>）。只存名字，不存密钥。 |
| <code>models</code> | <code>["gpt-image-1"]</code> | 写进工具文档的模型名单；agent 调用时可传任意 id。 |
| <code>defaultModel</code> | <code>models</code> 的第一项 | 调用未指定 <code>model</code> 时使用。 |
| <code>defaultParams</code> | <code>{}</code> | 合并进每次请求的额外字段——各家端点私有参数（aspect_ratio、style 等）的总出口。 |
| <code>timeoutMs</code> | <code>240000</code> | 单次请求超时。 |
| <code>outputDir</code> | <code>&lt;DSH 主目录&gt;/image-gen/output</code> | 图片保存目录；单次调用的 <code>output_dir</code> 可覆盖。 |
| <code>proxy</code> | <code>auto</code> | <code>auto</code>（沿用环境代理，否则探测系统代理：Windows 注册表 / macOS scutil）、<code>off</code>，或显式 <code>http://host:port</code>。 |

优先级：包内默认 &lt; cordis.patch.yml 条目的可选 <code>config:</code> 块 &lt; <code>image-gen.config.json</code>。

<code>size</code> 和 <code>quality</code> 是**透传字符串**：只有你显式设置（单次调用或 defaultParams）才会发送，否则由端点使用自己的默认值。各家取值词汇不同，插件不做校验，端点报错会原文返回给模型以便重试。

## 安全说明

- 发布包内除中性的 OpenAI 默认地址外不含任何端点，不含任何凭据；package.json 的 <code>files</code> 白名单限定了打包内容。
- 发布前用 <code>pnpm run pack:check</code> 打包并扫描 tarball 中的密钥形态字符串。
- API key 只从你自己的凭据存储解析，绝不出现在日志、工具输出或报错中。

## 兼容性与故障行为

详见 [COMPATIBILITY.md](COMPATIBILITY.md)。要点：插件只依赖 Node 内置模块和文档化的工具注册契约；加载失败被隔离在自身条目中，不会影响 DSH 启动。本插件不声明任何 DSH 版本门禁：既不会挡住安装，也不会在某次更新后被跳过，对 DSH 只要求那个文档化的工具契约。已在 DSH Desktop 0.2.0-rc.2 上验证。

## 卸载

在 Plugins 页面移除本 bundle 即可。你的 <code>image-gen.config.json</code>、已生成图片和凭据都不会被改动。
