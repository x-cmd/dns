---
x-title: x-cmd/dns —— DNS 综述
x-desc: DNS 是什么、一次查询从本机到权威服务器的完整路径、绕不开的记录类型，以及 DNS 为什么"藏"在每个协议里。
x-sidebar: DNS 综述
x-keywords: dns, 域名, 解析器, 权威, glue, ttl, rrset, txt, mx, cname, dig, named, bind, knot
x-json-ld:
  '@context': https://schema.org
  '@graph':
    - '@type': TechArticle
      headline: 'DNS —— 是什么与怎么工作'
      inLanguage: 'zh-CN'
      about: '域名系统协议与解析器架构'
---

# DNS —— 是什么与怎么工作

> 一页式参考。更深的内容见
> [1. 更安全的 DNS](./1-safer-dns.cn.md) 与
> [2. DNS 隧道，50 行讲明原理](./2-dns-tunneling-50-line-demo.cn.md)。

## 一句话讲 DNS 是什么

DNS 是一个 **分布式的、分层组织的数据库**，把人类可读的
名字（`www.example.com`）映射到机器可路由的标识（IPv4/IPv6
地址、邮件交换器、服务定位器、任意文本……）。它跑在
**53 端口** —— 普通查询用 UDP，大响应和 zone transfer
用 TCP。

## 一次查询的完整生命周期

你在浏览器输入 `https://www.example.com` 时：

```
┌──────┐  1. 查 OS 缓存            ┌─────────────────────────┐
│ 应用 │ ───────────────────────► │ Stub 解析器（glibc、   │
└──────┘                          │ systemd-resolved 等）  │
                                   └────────────┬────────────┘
                                                │ miss
                                                ▼
                                   ┌─────────────────────────┐
                                   │ 递归解析器              │
                                   │ (ISP、8.8.8.8、1.1.1.1)│
                                   └────────────┬────────────┘
                                                │ 迭代
        ┌───────────────────────────────────────┼──────────────────────────────┐
        ▼                       ▼               ▼                              ▼
  ┌───────────┐         ┌───────────┐    ┌───────────┐               ┌───────────────┐
  │ 根 (.)    │ ──────► │ TLD (.com)│ ─► │ 权威                   │ 权威（最终答）│
  │ 13 个 IP │ refer   │ 13 个 IP │ refer   │ (example.com)         │               │
  └───────────┘         └───────────┘    └───────────┘               └───────────────┘
```

OS 层的 stub 解析器问 **递归解析器**（"请给我
`www.example.com` 的答案"）。递归解析器自顶向下走完三级
—— 根、TLD、权威 —— 每一级返回下一级的 NS 记录。走到
`example.com` 的权威服务器时拿到 A/AAAA 记录，再沿原路
返回，每一步都缓存。

用户感知到一次往返，递归解析器干了剩下的活。这就是
DNS 的 "迭代查询、递归应答" 划分。

## 必须知道的记录类型

| 类型 | 码 | 回答什么 | 示例 |
| --- | --- | --- | --- |
| A | 1 | IPv4 地址 | `93.184.216.34` |
| AAAA | 28 | IPv6 地址 | `2606:2800:220:1:248:1893:25c8:1946` |
| CNAME | 5 | 别名指向另一个名字 | `www → example.com` |
| MX | 15 | 邮件交换器（含优先级） | `10 mail.example.com.` |
| NS | 2 | 权威名称服务器 | `ns1.example.com.` |
| TXT | 16 | 自由文本 | SPF、DKIM、DMARC、任意负载 |
| SRV | 33 | 服务定位（主机+端口） | `_sip._tcp.example.com.` |
| CAA | 257 | 该域名授权的 CA | `0 issue "letsencrypt.org"` |
| OPT | 41 | EDNS0 扩展（DO 位、负载大小） | `EDNS version 0, UDP 4096` |

TXT 是最宽松的，也是最常被滥用的 —— 见
[2. DNS 隧道](./2-dns-tunneling-50-line-demo.cn.md)。

## DNS 包长什么样

DNS 查询就是一个很小的 UDP 数据报。首部 12 字节：
`ID (2) | FLAGS (2) | QDCOUNT (1 个问题) | ANCOUNT (0) |
NSCOUNT (0) | ARCOUNT (0)`。后面的每个 section 是
**资源记录**列表。一条资源记录包含：

- **NAME** —— 要么字面标签（`www`、`example`、`com`、
  终结符），要么 2 字节压缩指针（`0xC0 0x0C` →
  "回到 offset 12"）。压缩机制让 30 字节的查询只占 30 字
  节而不是 60。
- **TYPE (2)** —— A、AAAA、TXT 等。
- **CLASS (2)** —— 几乎总是 `IN`（Internet，值 1）。
- **TTL (4)** —— 答案可被缓存多久。
- **RDLENGTH (2)** + **RDATA** —— 记录相关负载。

不带 EDNS0 时 UDP 有效负载上限 **512 字节**。带 EDNS0
时双方协商到 4096（实际常用 1232 —— 避开 IP 分片）。

## 缓存与 TTL

TTL 是解析器的承诺："接下来 N 秒你可以直接复用这个答
  案，不用再问。"TTL 300 表示 "5 分钟"；86400 是 "1 天"。
否定缓存有自己的 TTL（SOA 里的 `MINIMUM` 字段，缺失应答
时合成一个）。

缓存是 DNS 能 scale 的关键。没有缓存，根服务器要扛互联
网上每一次查询。有了缓存，它们只看到长尾的 10%。

## DNS 不负责什么

- **没有传输安全。** 经典 DNS 是明文 UDP/53，路径上任何
  人能看到、改动应答。见
  [1. 更安全的 DNS](./1-safer-dns.cn.md)。
- **没有应答认证。** 应答可以被伪造。DNSSEC 给整条链路签
  名；部署状态见
  [1. 更安全的 DNS](./1-safer-dns.cn.md)。
- **没有内置策略。** 缓存什么、过滤什么、记录什么，全是解
  析器自己定的。协议层没有 "no logging" 标记。

## 延伸阅读

- [1. 更安全的 DNS](./1-safer-dns.cn.md) ——
  DoH、DoT、DoQ、DNSSEC。
- [2. DNS 隧道，50 行讲明原理](./2-dns-tunneling-50-line-demo.cn.md) ——
  为什么 DNS 是个隐蔽信道，以及怎么搭一个。
- [`SKILL.md`](../SKILL.md) —— 用本仓库源码自己跑一个
  DNS 服务。