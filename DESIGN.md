---
name: 阿龍记账工作台
description: 沿用 ALOONG 蓝白视觉的轻量本地个人账本
colors:
  accent: "#2b6df8"
  accent-strong: "#1e5ae6"
  accent-soft: "#ebf2ff"
  on-accent: "#ffffff"
  page: "#f6f8fc"
  card: "#ffffff"
  ink: "#17233c"
  muted: "#58667e"
  line: "#e3eaf6"
  control: "#ffffff"
  danger: "#b43d3d"
  expense: "#b43d3d"
  income: "#18794e"
  dark-accent: "#8bb4ff"
  dark-accent-strong: "#b0ccff"
  dark-accent-soft: "#223653"
  dark-on-accent: "#122345"
  dark-page: "#101826"
  dark-card: "#192436"
  dark-ink: "#edf3ff"
  dark-muted: "#a9b9d1"
  dark-line: "#334259"
  dark-control: "#142033"
  dark-danger: "#ffaaa3"
  dark-expense: "#ffaaa3"
  dark-income: "#8bdbb6"
typography:
  display:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "36px"
    fontWeight: 730
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  headline:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "21px"
    fontWeight: 750
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  field: "8px"
  button: "9px"
  grouped: "10px"
  notice: "11px"
  workspace: "15px"
  overview: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  shell: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.button}"
    padding: "9px 13px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
    textColor: "{colors.on-accent}"
  button-quiet:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "9px 13px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.button}"
    padding: "9px 10px"
    height: "40px"
  input:
    backgroundColor: "{colors.control}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "9px 11px"
    height: "42px"
  month-input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "7px 9px"
    height: "38px"
    width: "148px"
  navigation-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.field}"
    padding: "6px 11px"
    height: "40px"
  workspace-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.workspace}"
---

# Design System: 阿龍记账工作台

## Overview

**Creative North Star: "阿龍记账工作台"**

操作型界面，沿用 ALOONG 的中文分类、分类图标及蓝白视觉。视觉优先级服务于收支识别、列表浏览和快速录入；手机沿用同一套账本语言，以单列和大触控区适应窄屏。

无框架、无外部字体、无装饰动效，使用原生表单与触屏滚动；包内外部脚本兼容 Cindy CSP。宿主文字、背景、边界变量优先；统一细边界，不叠加装饰阴影。

**Key Characteristics:**
- ALOONG 蓝白身份，跟随 Light/Dark 模式。
- 系统字体、等宽金额数字与清晰层级。
- 电脑分栏、手机单列、原生表单大触控。
- 细边界与色面分组，轻量且无装饰动效。

## Colors

前置 token 记录 src/view.css 的实际回退值；主题变量可由宿主覆盖。保持单一蓝色强调，收入和支出颜色只表达账务语义。

### Primary

- **ALOONG 蓝**（accent）：主操作、选中账本导航和分类统计条。
- **强调蓝**（accent-strong）：余额与强调文字，也用于可悬停设备的主按钮悬停态。
- **浅蓝色面**（accent-soft）：编辑分段选中态、安静按钮悬停态与文本选择。
- **强调面文字**（on-accent）：蓝色按钮及选中导航上的文字。

### Neutral

- **页面、内容与控件面**（page、card、control）：分开页面背景、工作区和输入区。
- **正文与辅助文字**（ink、muted）：正文、标签、提示及占位文字。
- **细边界**（line）：分隔工作区、记录、筛选与状态提示。

### Semantic

- **收入**（income）：收入金额与收入标记。
- **支出及错误**（expense、danger）：支出金额、错误提示及失败状态；文字同时说明含义。

### Light/Dark mapping

prefers-color-scheme: dark 时使用对应 dark- token；两套值均来自现有样式。page、card、ink、muted、line 分别优先读取宿主 panel-bg、surface、text-primary、text-secondary、border-default 变量。

| Light token | Dark token |
| --- | --- |
| accent | dark-accent |
| accent-strong | dark-accent-strong |
| accent-soft | dark-accent-soft |
| on-accent | dark-on-accent |
| page | dark-page |
| card | dark-card |
| ink | dark-ink |
| muted | dark-muted |
| line | dark-line |
| control | dark-control |
| danger | dark-danger |
| expense | dark-expense |
| income | dark-income |

## Typography

全界面使用前置 token 中的系统字体栈，不加载外部字体。正文（14px）、页面标题（21px）和区段标题（16px）形成清楚的操作层级，辅助标签（12px）保持克制。

余额使用 display 层级（36px），在 480px 及以下缩为 31px，在 350px 及以下缩为 28px；页面标题在 480px 及以下为 20px。金额使用 tabular-nums。480px 及以下常规输入、选择与按钮采用 16px 基础字号，紧凑标签和月份输入保留各自字号。

## Layout

桌面容器居中，最大宽度 1280px，默认左右留白 32px。账单列表与右侧录入分栏，录入列宽 356px，间隔 20px；980px 及以下录入列缩至 326px，间隔 16px。录入区在桌面吸附于顶部 16px。

760px 及以下工作区单列，先列表后录入，取消吸附，间隔 18px；点击记账或添加提醒自动滚至录入。480px 及以下标题操作排两列，页面左右留白 12px，账本导航允许换行。表单默认两列，350px 及以下单列。

手机主要按钮、导航、列表操作、快捷提醒与月份选择器最小 44px。月份选择器在 760px 及以下最小 44px；按钮和普通输入的 44px 规则在 480px 及以下生效。采用原生滚动和内容换行，保留长名称、备注、空列表和错误状态的空间。

## Elevation & Depth

界面不使用装饰阴影。页面、内容与输入色面配合统一 1px 细边界表达分组；选中状态由强调色面呈现。焦点使用强调色 2px 外轮廓及 2px 偏移。无装饰动画；保留按钮按下 1px 位移的即时反馈，并尊重 prefers-reduced-motion。

## Shapes

输入和分段按钮使用 field 圆角；主要操作使用 button 圆角；编辑分段底座使用 grouped 圆角。状态提示、工作区与汇总容器依次使用 notice、workspace、overview 圆角。480px 及以下汇总容器圆角为 14px。分类图标沿用现有素材，操作图标使用描边 SVG。

## Components

### Buttons

主按钮使用强调色与强调面文字；安静按钮使用内容面和细边界；导出按钮使用透明底与辅助文字。可悬停设备上的主按钮加深，安静按钮采用浅蓝色面。焦点轮廓清晰，禁用时透明度为 0.45，按下有即时位移反馈。

### Inputs / Fields

原生表单使用控件面、正文色、细边界和 field 圆角，悬停边界转为强调色。占位文字使用不透明的 muted 色（opacity: 1），不额外降低透明度。错误保留输入；提示和费用信息沿用辅助文字层级。

### Navigation

今日、历史、订阅、提醒、分类共用工作区；选中账本导航使用实心强调色。手动、订阅、提醒、AI 共用轻量录入区，选中编辑分段使用浅强调面。通过 aria-pressed 表达当前状态，手机导航换行并保留大触控区。

### Cards / Containers

汇总与工作区使用内容面和细边界。列表记录使用行分隔，避免再套装饰卡片；提醒沿用同一工作区和录入结构。空状态教用户下一步，不填充假账单。

### Status and reminders

明示电脑/设备时区、提醒运行条件、模型费用；连接超时可恢复，未确认写入禁止重复写。图片识别发生在当前 Cindy 对话，插件校验并原子保存；提醒只显示宿主屏幕轻提示，不暗示系统闹钟或手机锁屏推送。

## Do's and Don'ts

### Do:

- **Do** 沿用 ALOONG 蓝白视觉、中文分类与现有分类素材，并支持 Light/Dark。
- **Do** 保留电脑分栏、手机单列与主要操作大触控区。
- **Do** 使用系统字体、等宽金额数字、清晰焦点与不透明占位文字。
- **Do** 如实显示状态、错误、费用和提醒运行条件。

### Don't:

- **Don't** 叠加装饰阴影、装饰动效、外部字体或前端框架。
- **Don't** 用假账单填充空状态，或把未核对的 AI 草稿表现为已入账。
- **Don't** 暗示提醒具有系统闹钟或手机锁屏推送的能力。
