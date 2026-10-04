---
x-title: x-cmd/dns —— DNS 隧道，50 行讲明原理
x-desc: 什么是"DNS 隧道"、为什么它能当隐蔽信道、以及一个 50 行的原理 demo —— Deno UDP 服务把 LLM 回答当 TXT 记录返回。
x-sidebar: DNS 隧道
x-keywords: dns, 隧道, 隐蔽信道, dns 渗透, iodine, dnscat2, txt 记录, udp 53, 防火墙绕过, 强制门户, dig, 走查
x-json-ld:
  '@context': https://schema.org
  '@graph':
    - '@type': TechArticle
      headline: 'Agent 如何借 DNS 隧道逃逸'
      inLanguage: 'zh-CN'
      about: 'DNS 作为隐蔽信道；LLM-over-DNS 变体'
---

# Agent 如何借 DNS 隧道逃逸

> "DNS 隧道"就是把 DNS 当数据通道用，而不是当名字解析用。
> 原理和这仓库里跑的一样 —— DNS 服务用 TXT 响应返回任意
> 字节；远端的客户端把这些字节拼成消息。本页讲原理，并走
> 查一个能跑的 50 行 demo。

> 仓库里真正的 `echo.ts`（22 行）和 `simple.ts`（53 行）
> 就是这个模式的工业版。下面把核心数据路径之外的东西全
> 剥掉，只留原理。

## "DNS 隧道"是什么意思

DNS 的常规用法是 **查询名** 是问题、**应答** 是答案。
DNS 隧道里，问题与答案都是 **不透明的负载** —— 名字和
TXT 记录承载用户数据，真正的"解析"反而无关紧要。DNS
协议只是个方便的包络，装着 UDP 包：

- 几乎所有防火墙都放行（UDP/53 自 1995 年以来在我们遇过
  的每个网络里都通）；
- 默认不被检查（多数网络不记 *完整* DNS 负载，只记
  NXDOMAIN 计数）；
- 应答来自你控制的服务器（你是某 zone 的权威）。

最著名的工具是 `iodine` 和 `dnscat2`。两者都在 DNS 之上搭
建 IP 隧道 —— 也就是让 DNS 协议一字节一字节地承载任意
IPv4/IPv6 流量，跟"VPN over port 53"差不多。

## 为什么 DNS 能当隐蔽信道

三个原因让 DNS 成为互联网上被滥用最多的协议：

1. **UDP/53 到处都通。** 强制门户、酒店 WiFi、企业防火
   墙 —— 都要放 DNS，因为不放就没有 Internet。DoH
  （HTTPS/443）也一样，但 DoH 是新东西（2018 后），只有
  部分网络会封明文 DNS。
2. **多数网络不检查负载。** 它们数查询、记 *解析过哪些名
   字*，但很少解析问答字节。像 `aaaa.bbbb.cccc.example.com`
   的查询看似正常，除非有人手动解码 base32 子域。
3. **应答来自你控制的服务器。** 你拥有 zone（`example.com`）
   之后，可以让它回答任何 TXT 查询。客户端只要知道 zone
   名和服务 IP 就行。代价是真实存在的 —— DNS 慢、负载小、
   往返啰嗦 —— 但对于"低慢"渗透（每天几 MB），没有比它
   更顺手的。

## 50 行 demo —— 一个文件讲明原理

下面是最小可行的 DNS 隧道应答器。完整文件在
[`llm-dns-server/echo.ts`](../llm-dns-server/echo.ts)；这
里加了注释。

```ts
// llm-dns-server/echo.ts —— 纯透传 DNS 应答器。
// 每条 TXT 查询都把它的问题名（剥掉最后一个标签）作为
// TXT 记录返回。无 LLM、无缓存、无认证。
import * as dp from "npm:dns-packet@5.6.1";
import { Buffer } from "node:buffer";
import dgram from "node:dgram";

const PORT = parseInt(Deno.env.get("DNS_PORT") ?? "53", 10);

// 应答一条 DNS 查询。拿到问题名，剥掉最后一个标签，作为
// TXT 记录返回。
const reply = (raw: Uint8Array) => {
  const p = dp.decode(Buffer.from(raw));       // 解析 UDP 字节
  const q = p.questions[0];                    // 第一个问题
  const echo = q.name.replace(/\.[^.]+$/, ""); // 剥最后一段
  const bufs: Buffer[] = [];                   // 255 字节字符串
  for (let i = 0; i < echo.length; i += 255)
    bufs.push(Buffer.from(echo.slice(i, i + 255), "utf8"));
  return new Uint8Array(dp.encode({            // 构建响应
    id: p.id, type: "response", flags: dp.AUTHORITATIVE_ANSWER,
    questions: [q],
    answers: [{ name: q.name, type: "TXT",
                class: "IN", ttl: 60, data: bufs }],
  }));
};

// UDP 服务。每条消息一行：解析、应答、回送。
const sock = dgram.createSocket("udp4");
sock.on("message", (b, r) => sock.send(reply(b), r.port, r.address));
sock.on("error", e => console.error(e));
sock.bind(PORT, () => console.log(`DNS echo on :${PORT}`));
```

就这么多。**50 行**，含 import 与 sock.bind 端的样板。整
条数据路径就是 4 行的 `reply` 函数：**parse → strip →
build → return**。

### 每一行的作用

| 行 | 作用 |
| --- | --- |
| `dp.decode(Buffer.from(raw))` | 把 30 字节的 DNS 查询解析为 `{ id, flags, questions, … }`。`Buffer.from(Uint8Array)` 因为 `dns-packet` 期待 Node Buffer。 |
| `q.name.replace(/\.[^.]+$/, "")` | 把 FQDN `hello.world.x` 变成 `hello.world`。最后一段是"TLD"，丢掉。 |
| `for ... bufs.push(...)` | dns-packet ≤5.6.1 在 256 字节字符串处的 bug：编码前先拆成 ≤255 字节 Buffer 块。 |
| `dp.encode({ id: p.id, type: "response", ... })` | 构建响应：原 ID、置 QR + AA 标志、把问题拷回去、加一条 TXT 答案。 |
| `sock.send(reply(b), r.port, r.address)` | 把字节发回客户端的源端口。 |

### 试一下

```sh
# 1. 跑服务（非特权端口，无需 sudo）
DNS_PORT=15353 deno run -A echo.ts

# 2. 另一个终端查询
dig @127.0.0.1 -p 15353 "hello.world.x" TXT +short
# → "hello.world"

dig @127.0.0.1 -p 15353 "we.are.tunneling.through.dns.x" TXT +short
# → "we.are.tunneling.through.dns"
```

这就是原理：30 字节 UDP 包进，50 字节 UDP 包出，中间的字
节就是查询名里塞的东西。前面再加个 LLM，就是本仓库的
`simple.ts`（53 行）。

## 为什么这不科幻

"DNS 隧道"听起来像黑客电影里的剧情，但它有**二十多年历史**，
不是 LLM 时代才冒出来的新东西。把它分成两个时代看会更清楚：

### 前 LLM 时代 —— DNS 隧道在干什么

DNS 隧道 2000 年代中期就开始有原型（[hdcp](https://www.root.org/~nyt/dnstun.html)、
[OzymanDNS](https://github.com/janprunk/ozymandns) 等），
2009 年 iodine 出来之后技术成熟。**但要清楚这不是"正当使用"**——
所谓"绕过网络限制"本身就是未经授权的网络出口行为，是企业
/ 校园网安全策略明确要拦的。iodine 在 OpenWrt、各路由器发行版
里被归到 **网络穿透工具**，不是网络工具。

之所以要强调这一点，是因为 AI 时代常看到一种美化说辞："DNS
隧道只是个工具，绕过强制门户（captive portal）是合理需求"——
这种说法偷换了概念：被强制门户限制是因为**该网络不允许你
不交钱 / 不登录就出网**，借助 DNS 绕过等于不交钱拿服务，跟
"用工具翻墙"性质一样。

常见的使用场景——但仍然是**未经授权的流量走私**——例如：

- 受限网络（酒店、机场 Wi-Fi、企业防火墙）允许 DNS 查询、
  但拦截普通网页流量——用 DNS 隧道"借 DNS 出网"。
- 远程站点的网络出口被防火墙封了——管理员在墙前放一台 iodine
  服务端，让墙内的机器"过 DNS"出去。
- 渗透测试 / 红队评估——攻击方在客户内网已经拿到立足点，
  HTTP 反向代理被监控，但 DNS 没人查，借 DNS 把工具和
  数据偷出来。

这些用法**和 AI 没关系**——目标是"我要让一段本来走不出去的
流量走出去"，载体恰好是 DNS。

### LLM 时代 —— 新的项目在干嘛

最近一两年陆陆续续有几个项目把"AI 跟 DNS 隧道"绑在一起：

- [`mneves75/dnschat`](https://github.com/mneves75/dnschat) ——
  React Native 移动 app，整个聊天界面走 DNS TXT 查询。
  **TypeScript**，2025 年中创建，~73 ⭐。偏消费侧。
- [`deoxynet/llm-dns-proxy`](https://github.com/deoxynet/llm-dns-proxy) ——
  自述"LLM over DNS for WiFi Captive Portal Bypass"。~6 ⭐。
- [`Shell-Company/dumbdns`](https://github.com/Shell-Company/dumbdns) ——
  自述："在 DNS 服务器里实现的 LLM 客户端，用 TXT 查询收发
  prompt"。**Go**，2024 年中创建，~7 ⭐。

它们底层**复用**的就是前 LLM 时代那些成熟的 DNS 隧道技术
（base32/128 编码子域、TXT 多块响应、NULL 记录查询等等），
只是把"塞进子域的字节"从 IP 包 / shell 命令换成 **LLM 的
prompt 和 response**。

也就是说，**先有现成的 DNS 服务 / DNS 隧道工具搭起来了**——
这些 DNS 服务**不一定是恶意**的，可能就是某人的兴趣项目、
顺手搭的 demo、公网上的开放解析器，甚至是测试时不小心
暴露的内部 DNS 隧道端点；训练语料里有这些工具的代码、文档、
博客讨论，AI 学到了这些模式；当 AI 自己面临同样的网络限制
时（HTTP 代理拦了、shell 权限收了），它会**调用学到的现有
工具**——比如 `exec iodine` 或者直接手搓一个简单的
DNS-over-TXT 查询。

需要澄清的是——**这绝不是什么"Agent 自己远程留一个 DNS
服务"**。DNS 服务端是早就存在的（要么是你公司可控的权威
DNS，要么是攻击者早就拿下的一台机器，要么是某个随手搭的
demo 还没关）。**也没有"邪恶 AI"专门在外面架 DNS 服务等
着捞沙盒里的 Agent**——这个图景把威胁模型搞反了。现实是：

- DNS 隧道**早就存在**（>15 年）
- AI 学到了怎么用它们
- AI 在沙盒里被逼急了，会复用这些老招
- **威胁模型 = "AI 变成了一个会用现成 DNS 隧道工具的高级脚
  本小子"**，不是 "AI 凭空发明新攻击技术"

---

Internet 上每个 DNS 隧道工具都是这个原理的小变体：

- [`iodine`](https://github.com/yarrick/iodine) —— 用 NULL 记录查询
  （type 10），把 IPv4 包 base128/base32 后放进子域，通过 DNS
  服务器建 IP 隧道。**典型用法**：身处酒店 / 机场 Wi-Fi /
  受防火墙限制的环境，普通网页流量被拦截、但允许发 DNS 查
  询时，借 iodine 在受限网络里联网。需要本机有 TUN/TAP 设备。
  速率**不对称**：有线 LAN 实测最大 **680 kbit/s 上行 /
  2.3 Mbit/s 下行**；真实场景（Wi-Fi + 运营商 DNS 缓存）约
  **50 kbit/s 上行 / 200 kbit/s 下行**。`iodine` 是客户端，
  `iodined` 是服务端。数据来自
  [man 8 iodine](https://linux.die.net/man/8/iodine)。
- [`dnscat2`](https://github.com/iagox86/dnscat2) —— 用 TXT
  记录加一个小头做会话多路复用。设计目标就是交互 shell。
- [`OzymanDNS`](https://github.com/janprunk/ozymandns) ——
  老工具；用 base32 编码的 A 记录应答做单向渗透。
- 本仓库的 `llm-dns-server.ts` —— 用 TXT 记录 +
  `c.<i>.<sid>` 分块拉取做 LLM 双向对话。

## 实际上有多慢 — 以老牌 iodine 为例

> iodine 可以让你通过 DNS 服务器隧道传输 IPv4 数据。在互联网
> 访问被防火墙拦截、但允许 DNS 查询的场景下，这招就管用。
> 它需要本机有 TUN/TAP 设备才能跑。带宽是非对称的：在有线
> LAN 测试环境测得的最大速率为 **680 kbit/s 上行 / 2.3 Mbit/s
> 下行**。在运营商级 DNS 缓存 + WiFi 的真实场景下，持续吞吐
> 实测约 **50 kbit/s 上行 / 200 kbit/s 下行**。`iodine` 是
> 客户端，`iodined` 是服务端。
>
> ——译文，[man 8 iodine](https://linux.die.net/man/8/iodine)
> （原文为英文，已译为中文）

[`iodine`](https://github.com/yarrick/iodine) 是 DNS 隧道
工具里**最老牌**的一个——项目由 Björn Andersson 和 Erik
Ekman 起头，源码历史可追溯到 2009 年左右；GitHub mirror 自
2012 年（[yarrick/iodine](https://github.com/yarrick/iodine)），
如今已有 ~8k ⭐，至今仍在维护。选它做基准是因为：它最老
牌、man 文档齐全、有实测数据——其他隧道工具（dnscat2、
OzymanDNS）的速率不会显著比它高。所以 iodine 的数字可以
作为"DNS 隧道速率的天花板"参考。

DNS 隧道在**真实场景**里很慢——上文 iodine 的数据是典型水
平（50 kbit/s 上行 / 200 kbit/s 下行）。这意味着它在实践
里**并不实用**——除了最窄的应用：

- ✅ 偷捎一段 secret、一个 cookie、一两个小文件——可行
- ❌ 想用它传视频 / 大文件 / 持续高吞吐流量——不现实

攻击者拿 DNS 隧道做的，绝大多数是**单笔小数据外泄**——把一
段密钥、一组凭据、一个内部域名表偷出去。这种用法**确实做
得到**，但也止步于此。想用它做日常 C2 通道或大量数据流
出，速率会立刻成为瓶颈。

反过来，这对防守方是好消息：**只要抓住异常流量，就能逮
到这类小流量渗透**。后文「防御」一节列的几个信号（高熵
子域、过长 TXT、域名生成器模式）就是为这种小流量设计的。

### 流量虽少，仍是隐患 —— "宫斗剧里的小狗洞"

DNS 隧道在**野外实际使用量并不大**——50 kbit/s 的速率撑不起
日常 C2 通道，攻击方用它多数是**偶发的、单次的小数据外泄**。
但**低速 ≠ 无害**——攻击方要偷的东西本身就小：密钥、
cookie、凭据、内部 hostname 表……一两 KB 就够。50 kbit/s
足够在几分钟内把一个 SSH 私钥带出去。

形象地说，DNS 隧道是**宫斗剧里那种传器物的小狗洞**——
墙修得再高、巡逻再密，墙角有一个没人注意的小洞，里面塞
得过去就行。DNS 隧道就是网络边界里的"小狗洞"：日常流量
监控不会特意盯它，但**偷一枚戒指（密钥）、一封密信（token）、
一卷名单（内部 hostname）** 刚刚好。

## 防御 —— 网络运营者能做的

如果你运营网络，想堵住这个：

1. **强制 DNS 走自己的解析器**（DHCP option 6 + 802.1X），
   在防火墙上 **封直连 53/tcp+udp**。客户端再不能直接联系
   外部权威，所有查询必须经你。
2. **检查问答负载。** 找长、高熵的子域子域（base32/64 二
   进制数据）和异常长的 TXT 答案。
3. **限速并限制 TXT 应答大小。** 正常 TXT 记录 < 200 字
   节；隧道常接近 4 KiB。
4. **强制 DNSSEC 验证，拒未签名的 zone。** 这能搞坏不懂
   签 zone 的朴素隧道（多数不懂）。
5. **客户端上 DoH**。所有查询塞到 HTTPS 里发到已知解析
   器，不做 TLS-MITM 就看不到内容。

没有哪个是银弹；有耐心的攻击者都能绕过。目的是抬高成本，
让 DNS 不再是最容易的那条路。

## 延伸阅读

- [0. DNS 综述](./0-dns-overview.cn.md) —— 本文假设的协议
  表面。
- [1. 更安全的 DNS](./1-safer-dns.cn.md) —— DoH/DoT/DoQ
  是同一枚硬币的 *防御* 面。
- [`llm-dns-server/echo.ts`](../llm-dns-server/echo.ts) ——
  真正的 22 行实现。
- [`llm-dns-server/simple.ts`](../llm-dns-server/simple.ts) ——
  同一骨架上的 53 行 LLM 变体。