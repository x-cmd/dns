---
x-title: x-cmd/dns —— 更安全的 DNS（DoH、DoT、DoQ、DNSSEC）
x-desc: 让 DNS 变安全的四种方式 —— 加密传输（DoT/DoH/DoQ）、认证应答（DNSSEC），以及各自的部署取舍。
x-sidebar: 更安全的 DNS
x-keywords: dns, doh, dot, doq, dnssec, tls, quic, 加密 dns, 隐私, ecs, edns, odoh, 不可关联
x-json-ld:
  '@context': https://schema.org
  '@graph':
    - '@type': TechArticle
      headline: '更安全的 DNS —— DoH、DoT、DoQ、DNSSEC'
      inLanguage: 'zh-CN'
      about: 'DNS 的加密传输与应答认证'
---

# 更安全的 DNS —— DoH、DoT、DoQ、DNSSEC

> 经典 DNS 是明文、不可认证、无策略的。本页讲实际落地
> 的四种修复 —— 报文格式、威胁模型、运营取舍。

## 四种修复，一张表

| 修复 | 加了什么 | 报文 | 状态 |
| --- | --- | --- | --- |
| **DoT**（DNS-over-TLS，RFC 7858） | 加密传输 | TCP/853 | ISP 与公共解商已部署 |
| **DoH**（DNS-over-HTTPS，RFC 8484） | 加密传输，混入网页 | HTTPS/443 | Firefox、Chrome、iOS、Android 已部署 |
| **DoQ**（DNS-over-QUIC，RFC 9250） | UDP 上的加密传输 | UDP/853 | AdGuard、新版解商部署 |
| **DNSSEC**（RFC 4033+） | 应答签名；到根的信任链 | 任意传输 | 根域自 2010 年签名；约 30% TLD 部署 |

它们彼此 **独立**：DoH/DoT/DoQ 加密信道但不认证应答；
DNSSEC 认证应答但不加密信道。两类可叠加。

## DoT —— DNS-over-TLS

```
Client                          Resolver
  │─── TCP SYN ────────────────►│ :853
  │◄── TCP SYN-ACK ────────────│
  │─── TLS ClientHello ────────►│
  │◄── TLS 握手 ───────────────│
  │─── DNS 查询（TLS 包裹）───►│
  │◄── DNS 响应 ───────────────│
```

**报文**：TLS 1.2/1.3 连接走 **TCP/853**。每条 DNS 查询是
TLS 流上的 2 字节大端长度前缀 + 原始 DNS 报文 —— 和 HTTP/1.1
的分帧技巧一样。

**优点**：简单、一连接一解商、易推理、无需 web 设施。

**缺点**：单个 TCP/853 端口对 DPI 是清晰信号；部分企业防
火墙直接封。

**部署**：`1.1.1.1`（Cloudflare）、`8.8.8.8`（Google）、
Quad9、AdGuard —— 都监听 TCP/853。

## DoH —— DNS-over-HTTPS

```
GET /dns-query?dns=<base64url> HTTP/1.1
Host: 1.1.1.1
Accept: application/dns-message
```

或

```
POST /dns-query HTTP/1.1
Host: 1.1.1.1
Content-Type: application/dns-message
Content-Length: <n>

<原始 DNS 查询字节>
```

**报文**：完整 HTTPS 请求，body 是裸 DNS 报文。RFC 8484。

**优点**：与网页流量无差别；要封就要封掉所有 HTTPS（不现
实）。

**缺点**：把 DNS 绑到一个 HTTP 主机（可 CDN，但比单解商更
  复杂）；排障不直观（"curl 这个 DoH 端点"）。

**部署**：Firefox（2018 起）、Chrome（2021 起）、iOS
（2020 起，全系统）、Android（Private DNS）、多数现代 OS。
公共解商都暴露 `https://1.1.1.1/dns-query{,…}`。

## DoQ —— DNS-over-QUIC

```
Client                          Resolver
  │─── QUIC Initial ────────────►│ UDP/853
  │◄── QUIC 握手 ──────────────│
  │─── DNS_STREAM frame ────────►│
  │◄── DNS_STREAM frame ────────│
```

**报文**：UDP/853 上的 QUIC 连接，DNS_STREAM 帧携带查询。
QUIC 的流多路复用让一条连接并发多查询。

**优点**：自带 TLS 1.3、无队头阻塞（一条慢查询不会卡住别的）、0-RTT
恢复。

**缺点**：UDP/853 比 DoT 更明显地标"加密 DNS"；部署少于 DoT
家庭。

**部署**：AdGuard、NextDNS、最近的 Knot / PowerDNS。浏览器
  接入稀。

## DNSSEC —— 应答签名

DNSSEC 是另一条正交轴：它 **认证** 应答（MITM 没法伪造
`evil.example.com → 1.2.3.4`），但不加密查询。

信任链从根域（`.` 已签名）开始；签名的 TLD（`.com`、
`.net`、`.org`，约 90% 国家 TLD）在父域放 DS 记录；二级
域（`example.com`）签名自己的记录并在 `.com` 放 DS。验证
解商沿链走，任何签名对不上的应答会被拒。

**解决什么**：缓存投毒（Kaminsky 类）、恶意解商的透明 MITM。

**不解决什么**：不加密、不隐藏 *查询*；验证解商仍然信任
TLD 运营者诚实地委派二级域。

**状态**：根域 100% 签名（2010 起）；约 35% TLD；约 5%
二级域。多数公共解商（Cloudflare、Google、Quad9）默认
验证。

## 没人谈的隐私层 —— ECS 与 EDNS

EDNS0 **Client Subnet**（ECS）让递归解商告诉权威服务器
*查询来自哪个客户端子网*，权威据此返回地理分布的应答。
代价：ECS 是隐私泄露（即使走 DoH/DoQ，权威也知道你的
IPv4 /24）。

现代 DoH/DoQ 解商要么外发时掩盖（Cloudflare `1.1.1.1`
模糊最后一段），要么根本不发送。**Oblivious DoH**
（`oDoH`，draft-irtf-pearg-oblivious-dns）更进一步：你和
解商之间加一个中继，任何一方都无法把你的 IP 与查询关联
起来。早期采用。

## 实际该怎么配

个人机器：

1. **用支持 DoH 的公共解商。**
   - `1.1.1.1`（Cloudflare）—— 经过审计、快、ECS 已掩。
   - `9.9.9.9`（Quad9）—— 拦截已知恶意域。
   - `8.8.8.8`（Google）—— 覆盖最广、日志更多。
2. **OS 启用 DNSSEC 验证。** 现代 OS 默认开；老的
   （`/etc/resolv.conf` 加 `dnssec` 选项，或 `unbound` 加
   `validator`）需要显式开。
3. **不要自建解商**，除非你在运营一个。公共解商跑得好、
   经过审计。

企业：

1. **自己跑验证递归解商。** 同网络上的 `unbound` 或
   `knot-resolver`，把客户端指过去。验证 DNSSEC；除非策略
   允许否则不转发到公共解商。
2. **DoT vs DoH 拍板。** DoT 在路由器上更简单；DoH 穿中
   间盒更强。多数现代解商两者都接受。
3. **准备接 "这域名解不出来" 的工单。** 缓存行为会变；错
   误会少但更诡异。

## 延伸阅读

- [2. DNS 隧道，50 行讲明原理](./2-dns-tunneling-50-line-demo.cn.md) ——
  未加密 DNS 的滥用案例；DoH 是反过来的同一招。
- [`SKILL.md`](../SKILL.md) —— 跑本仓库的 DNS 服务；它在
  你绑的端口上就是明文 DNS。