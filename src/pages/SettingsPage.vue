<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { usePluginsStore } from '../stores/plugins'
import { getInstalledPackage } from '../plugins/host/host'
import { downloadPackage, fetchBuiltinPackage, fetchPackageFromUrl, readPackageFromFile } from '../plugins/host/packageIO'
import type { PluginPackage } from '../plugins/host/types'
import { probeSource } from '../plugins/host/host'
import { ACCENT_PRESETS, THEME_MODES, type ThemeMode } from '../theme'

const settings = useSettingsStore()
const plugins = usePluginsStore()

const proxyUrl = ref(settings.settings.proxyWorkerUrl)
const interval = ref(settings.settings.fetchIntervalMin)
const notify = ref(settings.settings.notificationsEnabled)
const accent = ref(settings.settings.accent)
const mode = ref<ThemeMode>(settings.settings.themeMode)
const bgGlow = ref(settings.settings.bgGlow)
const remoteOn = ref(settings.settings.enableRemotePlugins)

const testState = ref<'idle' | 'testing' | 'ok' | 'fail'>('idle')
const testMsg = ref('')
const notifyDenied = ref(false)

/** 官方插件包地址（随站点部署在 public/plugins/，规范 §12 发布物形态） */
const officialPkgBase = `${location.origin}${import.meta.env.BASE_URL}plugins/yinhuadm.asplugin.json`

// ========= 插件导入/导出/删除（docs/插件导入导出与热插拔设计.md §4.4/§6）=========
const pluginUrlInput = ref('')
const staged = ref<PluginPackage | null>(null)
const stagedOrigin = ref<'file' | 'url'>('file')
const pluginBusy = ref(false)
const pluginError = ref('')
const pluginMsg = ref('')
const confirmDeleteId = ref<string | null>(null)

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

async function onPackageFile(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  pluginError.value = ''
  pluginMsg.value = ''
  try {
    staged.value = await readPackageFromFile(file)
    stagedOrigin.value = 'file'
  } catch (e) {
    pluginError.value = errMsg(e)
  }
}

async function importFromUrl(): Promise<void> {
  const u = pluginUrlInput.value.trim()
  if (!u || pluginBusy.value) return
  pluginBusy.value = true
  pluginError.value = ''
  pluginMsg.value = ''
  try {
    staged.value = await fetchPackageFromUrl(u)
    stagedOrigin.value = 'url'
  } catch (e) {
    pluginError.value = errMsg(e)
  } finally {
    pluginBusy.value = false
  }
}

async function confirmInstall(): Promise<void> {
  if (!staged.value || pluginBusy.value) return
  pluginBusy.value = true
  pluginError.value = ''
  try {
    const info = await plugins.install(staged.value, { origin: stagedOrigin.value })
    pluginMsg.value = `已安装 ${info.name} v${info.version}`
    staged.value = null
  } catch (e) {
    pluginError.value = errMsg(e)
    staged.value = null
  } finally {
    pluginBusy.value = false
  }
}

async function exportSource(id: string, type: 'builtin' | 'remote'): Promise<void> {
  pluginError.value = ''
  pluginMsg.value = ''
  try {
    const pkg = type === 'builtin' ? await fetchBuiltinPackage(id) : await getInstalledPackage(id)
    if (!pkg) throw new Error('该插件没有已持久化的包')
    downloadPackage(pkg)
  } catch (e) {
    pluginError.value =
      type === 'builtin'
        ? `导出失败：${errMsg(e)}（内置插件需先运行 npm run pack:plugins 构建产物并部署）`
        : `导出失败：${errMsg(e)}`
  }
}

async function reloadSource(id: string): Promise<void> {
  pluginError.value = ''
  pluginMsg.value = ''
  try {
    await plugins.reload(id)
    pluginMsg.value = `已重载 ${id}`
  } catch (e) {
    pluginError.value = `重载失败：${errMsg(e)}`
  }
}

async function deleteSource(id: string, wipeStorage: boolean): Promise<void> {
  pluginError.value = ''
  pluginMsg.value = ''
  confirmDeleteId.value = null
  try {
    await plugins.uninstall(id, wipeStorage)
    pluginMsg.value = `已删除 ${id}${wipeStorage ? '（含其保存的数据）' : ''}`
  } catch (e) {
    pluginError.value = `删除失败：${errMsg(e)}`
  }
}

function pickAccent(id: string): void {
  accent.value = id
  settings.setAccent(id)
}

function pickMode(id: ThemeMode): void {
  mode.value = id
  settings.setThemeMode(id)
}

function saveGlow(): void {
  settings.setBgGlow(bgGlow.value)
}

function saveRemoteOn(): void {
  settings.setRemotePluginsEnabled(remoteOn.value)
}

function saveProxy(): void {
  settings.setProxyWorkerUrl(proxyUrl.value)
  void runTest()
}

function saveInterval(): void {
  settings.setFetchInterval(Number(interval.value) || 30)
}

function toggleSource(id: string, ev: Event): void {
  settings.setSourceEnabled(id, (ev.target as HTMLInputElement).checked)
}

/** 连通性测试：走完整代理链对第一个已启用源做一次真实拉取（无单源特判） */
async function runTest(): Promise<void> {
  testState.value = 'testing'
  testMsg.value = ''
  try {
    const r = await probeSource()
    testState.value = 'ok'
    testMsg.value = `连接成功（${r.name} · 通道：${r.channel ?? 'direct'}）`
  } catch (e) {
    testState.value = 'fail'
    testMsg.value = `连接失败：${e instanceof Error ? e.message : String(e)}`
  }
}

async function saveNotify(): Promise<void> {
  if (notify.value) {
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      try {
        const p = await Notification.requestPermission()
        if (p !== 'granted') {
          notify.value = false
          notifyDenied.value = true
        } else {
          notifyDenied.value = false
        }
      } catch {
        notify.value = false
        notifyDenied.value = true
      }
    }
  }
  settings.setNotificationsEnabled(notify.value)
}
</script>

<template>
  <div class="w-full space-y-4">
    <h2 class="text-[15px] font-semibold text-ink-2">设置</h2>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <!-- 外观 -->
      <section
        class="rounded-2xl border border-line bg-surface p-4 shadow-[0_2px_16px_rgba(30,41,59,0.05)] backdrop-blur-xl"
      >
        <h3 class="text-xs font-semibold tracking-wide text-ink-4">外观</h3>
        <p class="mt-1.5 text-[13px] text-ink-2">明暗模式</p>
        <div class="mt-2.5 inline-flex items-center gap-1 rounded-full border border-line-2 bg-surface p-1">
          <button
            v-for="m in THEME_MODES"
            :key="m.id"
            type="button"
            class="rounded-full px-3.5 py-1.5 text-xs transition-all duration-200"
            :class="
              mode === m.id
                ? 'bg-accent-600 font-medium text-white shadow-sm'
                : 'text-ink-2 hover:bg-surface-2'
            "
            @click="pickMode(m.id)"
          >
            {{ m.name }}
          </button>
        </div>
        <p class="mt-3.5 text-[13px] text-ink-2">主题色</p>
        <div class="mt-2.5 flex flex-wrap gap-2.5">
          <button
            v-for="p in ACCENT_PRESETS"
            :key="p.id"
            type="button"
            class="group flex flex-col items-center gap-1"
            :title="p.name"
            @click="pickAccent(p.id)"
          >
            <span
              class="h-8 w-8 rounded-full shadow-sm transition-all duration-150"
              :style="{ background: `linear-gradient(135deg, ${p.shades['400']}, ${p.shades['600']})` }"
              :class="accent === p.id ? 'ring-2 ring-offset-2 ring-accent-500 dark:ring-offset-[#10131d]' : 'group-hover:scale-110'"
            />
            <span class="text-[10px]" :class="accent === p.id ? 'text-accent-600' : 'text-ink-4'">{{ p.name }}</span>
          </button>
        </div>
        <div class="mt-4 flex items-center justify-between border-t border-line pt-3">
          <span class="text-[13px] text-ink-2">背景光斑</span>
          <label class="relative inline-flex cursor-pointer items-center">
            <input v-model="bgGlow" type="checkbox" class="peer sr-only" @change="saveGlow" />
            <div
              class="h-5 w-9 rounded-full bg-gray-300/80 dark:bg-white/15 transition-all duration-200 peer-checked:bg-accent-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 peer-checked:after:translate-x-4"
            />
          </label>
        </div>
      </section>

      <!-- 数据源（含插件导入导出与热插拔） -->
      <section
        class="rounded-2xl border border-line bg-surface p-4 shadow-[0_2px_16px_rgba(30,41,59,0.05)] backdrop-blur-xl"
      >
        <h3 class="text-xs font-semibold tracking-wide text-ink-4">数据源</h3>
        <ul class="mt-3 space-y-2">
          <li
            v-for="s in plugins.sources"
            :key="s.id"
            class="rounded-xl border border-line-2 bg-surface px-3.5 py-2.5 transition hover:bg-surface-2"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="text-[13.5px] text-ink">
                  {{ s.name }}
                  <span
                    class="ml-1 rounded px-1 py-0.5 align-[1px] text-[10px]"
                    :class="
                      s.type === 'builtin'
                        ? 'bg-gray-100/90 text-ink-3 dark:bg-white/10 dark:text-ink-4'
                        : 'bg-accent-500/10 text-accent-600 dark:text-accent-400'
                    "
                  >{{ s.type === 'builtin' ? '内置' : '外置' }}</span>
                </p>
                <p class="truncate text-[11px] text-ink-4">
                  {{ s.id }} · v{{ s.version }} · {{ s.capabilities.join(' / ') }}
                </p>
              </div>
              <label class="relative inline-flex shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  class="peer sr-only"
                  :checked="settings.isSourceEnabled(s.id)"
                  @change="toggleSource(s.id, $event)"
                />
                <div
                  class="h-5 w-9 rounded-full bg-gray-300/80 dark:bg-white/15 transition-all duration-200 peer-checked:bg-accent-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 peer-checked:after:translate-x-4"
                />
              </label>
            </div>
            <!-- 删除二次确认（外置插件） -->
            <div v-if="confirmDeleteId === s.id" class="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
              <span class="text-[11px] text-ink-2">删除「{{ s.name }}」：</span>
              <button
                type="button"
                class="rounded-lg border border-line-2 bg-surface-3 px-2.5 py-1 text-[11px] text-ink-2 transition hover:bg-surface-2"
                @click="deleteSource(s.id, false)"
              >保留其数据</button>
              <button
                type="button"
                class="rounded-lg bg-rose-500/90 px-2.5 py-1 text-[11px] text-white transition active:opacity-85"
                @click="deleteSource(s.id, true)"
              >连同其数据</button>
              <button
                type="button"
                class="rounded-lg px-2 py-1 text-[11px] text-ink-4 transition hover:text-ink-2"
                @click="confirmDeleteId = null"
              >取消</button>
            </div>
            <!-- 外置插件操作行 -->
            <div v-else-if="s.type === 'remote'" class="mt-2 flex items-center gap-3 border-t border-line pt-2">
              <button type="button" class="text-[11px] text-ink-4 transition hover:text-accent-600" @click="exportSource(s.id, 'remote')">导出</button>
              <button type="button" class="text-[11px] text-ink-4 transition hover:text-accent-600" @click="reloadSource(s.id)">重载</button>
              <button type="button" class="text-[11px] text-ink-4 transition hover:text-rose-600" @click="confirmDeleteId = s.id">删除…</button>
            </div>
          </li>
        </ul>

        <!-- 内置插件导出产物 -->
        <div class="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <button
            v-for="s in plugins.sources.filter((x) => x.type === 'builtin')"
            :key="`exp-${s.id}`"
            type="button"
            class="text-[11px] text-ink-4 transition hover:text-accent-600"
            @click="exportSource(s.id, 'builtin')"
          >导出 {{ s.name }} 包</button>
        </div>

        <!-- 导入入口（默认关闭，规范 §11） -->
        <div class="mt-3 border-t border-line pt-3">
          <div class="flex items-center justify-between">
            <span class="text-[13px] text-ink-2">允许导入外部插件</span>
            <label class="relative inline-flex cursor-pointer items-center">
              <input v-model="remoteOn" type="checkbox" class="peer sr-only" @change="saveRemoteOn" />
              <div
                class="h-5 w-9 rounded-full bg-gray-300/80 dark:bg-white/15 transition-all duration-200 peer-checked:bg-accent-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 peer-checked:after:translate-x-4"
              />
            </label>
          </div>
          <template v-if="remoteOn">
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <input id="plugin-file-input" type="file" accept=".json,.asplugin,application/json" class="sr-only" @change="onPackageFile" />
              <label
                for="plugin-file-input"
                class="cursor-pointer rounded-xl border border-line-2 bg-surface-3 px-3.5 py-2 text-xs text-ink-2 transition hover:bg-surface-2"
              >导入插件包文件</label>
              <input
                v-model="pluginUrlInput"
                type="url"
                placeholder="或粘贴清单 URL（https://…/plugin.json）"
                class="min-w-0 flex-1 rounded-xl border border-line-2 bg-surface-3 px-3 py-2 text-xs outline-none transition focus:border-accent-300 focus:bg-surface-2"
              />
              <button
                type="button"
                :disabled="pluginBusy || !pluginUrlInput.trim()"
                class="rounded-xl bg-gradient-to-br from-accent-500 to-accent-400 px-3.5 py-2 text-xs text-white shadow-sm transition active:opacity-85 disabled:opacity-50"
                @click="importFromUrl"
              >获取</button>
            </div>
            <p class="mt-2 text-[11px] leading-relaxed text-ink-4">
              插件包为单文件 JSON（.asplugin.json）。加载第三方代码前会展示权限摘要并要求确认；请仅从可信来源安装。
              官方插件包随本站点发布：导入地址填 <code class="rounded bg-gray-100/90 px-1 dark:bg-white/10">{{ officialPkgBase }}</code>（樱花动漫）。
            </p>
          </template>
        </div>
        <p v-if="pluginMsg" class="mt-2.5 text-xs text-emerald-600">✓ {{ pluginMsg }}</p>
        <p v-if="pluginError" class="mt-2.5 text-xs text-rose-600">{{ pluginError }}</p>
      </section>

      <!-- 代理 -->
      <section
        class="rounded-2xl border border-line bg-surface p-4 shadow-[0_2px_16px_rgba(30,41,59,0.05)] backdrop-blur-xl"
      >
        <h3 class="text-xs font-semibold tracking-wide text-ink-4">代理（CORS）</h3>
        <p class="mt-1.5 text-xs leading-relaxed text-ink-4">
          数据源接口仅对源站域名开放跨域，需经代理访问。填入你自部署的 Cloudflare Worker
          地址后走主通道，失败时自动回退公共代理。部署方法见项目 <code class="rounded bg-gray-100/90 dark:bg-white/10 px-1">worker/README</code>。
        </p>
        <input
          v-model="proxyUrl"
          type="url"
          placeholder="https://your-proxy.your-name.workers.dev"
          class="mt-3 w-full rounded-xl border border-line-2 bg-surface-3 px-3 py-2 text-sm outline-none transition focus:border-accent-300 focus:bg-surface-2"
        />
        <div class="mt-3 flex items-center gap-2">
          <button
            type="button"
            class="rounded-xl bg-gradient-to-br from-accent-500 to-accent-400 px-5 py-2 text-sm text-white shadow-sm transition active:opacity-85"
            @click="saveProxy"
          >
            保存
          </button>
          <button
            type="button"
            class="rounded-xl border border-line-2 bg-surface-3 px-5 py-2 text-sm text-ink-2 backdrop-blur transition hover:bg-surface-2"
            @click="runTest"
          >
            测试连通
          </button>
        </div>
        <p v-if="testState === 'ok'" class="mt-2.5 text-xs text-emerald-600">✓ {{ testMsg }}</p>
        <p v-else-if="testState === 'fail'" class="mt-2.5 text-xs text-rose-600">{{ testMsg }}</p>
        <p v-else-if="testState === 'testing'" class="mt-2.5 text-xs text-ink-4">测试中…</p>
      </section>

      <!-- 更新检测与通知 -->
      <section
        class="rounded-2xl border border-line bg-surface p-4 shadow-[0_2px_16px_rgba(30,41,59,0.05)] backdrop-blur-xl"
      >
        <h3 class="text-xs font-semibold tracking-wide text-ink-4">更新检测与通知</h3>
        <div class="mt-3 flex items-center justify-between">
          <span class="text-[13.5px] text-ink-2">抓取间隔</span>
          <select
            v-model.number="interval"
            class="rounded-xl border border-line-2 bg-surface-3 px-2.5 py-1.5 text-sm outline-none focus:border-accent-300"
            @change="saveInterval"
          >
            <option :value="15">15 分钟</option>
            <option :value="30">30 分钟</option>
            <option :value="60">1 小时</option>
            <option :value="120">2 小时</option>
          </select>
        </div>
        <div class="mt-3 flex items-center justify-between">
          <span class="text-[13.5px] text-ink-2">系统通知</span>
          <input
            v-model="notify"
            type="checkbox"
            class="h-4 w-4 accent-accent-600"
            @change="saveNotify"
          />
        </div>
        <p v-if="notifyDenied" class="mt-2 text-xs text-amber-600 dark:text-amber-400">
          浏览器未授予通知权限，已保持关闭；可在浏览器设置里放行后重新开启。
        </p>
        <p class="mt-2.5 text-[11px] leading-relaxed text-ink-4">
          更新提醒在页面打开时进行（GitHub Pages 无后端）；关闭浏览器期间不会推送，角标在下次打开时补上。
        </p>
      </section>
    </div>

    <!-- 权限确认弹层（规范 §11 步骤 2：显式确认后才加载） -->
    <div
      v-if="staged"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      @click.self="staged = null"
    >
      <div class="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-xl">
        <h4 class="text-sm font-semibold text-ink">安装插件</h4>
        <p class="mt-1 text-[13px] text-ink-2">
          {{ staged.manifest.name ?? '未知插件' }}
          <span class="text-ink-4">v{{ staged.manifest.version ?? '?' }}</span>
        </p>
        <dl class="mt-3 space-y-1.5 text-xs">
          <div class="flex justify-between gap-3">
            <dt class="shrink-0 text-ink-4">标识</dt>
            <dd class="truncate text-ink-2">{{ staged.manifest.id ?? '?' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="shrink-0 text-ink-4">能力</dt>
            <dd class="truncate text-ink-2">{{ (staged.manifest.capabilities ?? []).join(' / ') || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="shrink-0 text-ink-4">允许访问域名</dt>
            <dd class="truncate text-ink-2">{{ (staged.manifest.permissions?.domains ?? []).join('、') || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="shrink-0 text-ink-4">插件私有存储</dt>
            <dd class="text-ink-2">{{ staged.manifest.permissions?.storage ? '使用' : '不使用' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="shrink-0 text-ink-4">沙箱</dt>
            <dd class="text-ink-2">Worker（与页面隔离）</dd>
          </div>
          <div v-if="staged.manifest.author" class="flex justify-between gap-3">
            <dt class="shrink-0 text-ink-4">作者</dt>
            <dd class="truncate text-ink-2">{{ staged.manifest.author }}</dd>
          </div>
        </dl>
        <p class="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
          安装即信任该第三方代码运行并按上述域名发起网络请求。请确认来源可信，域名与其官网一致。
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-xl border border-line-2 bg-surface-3 px-4 py-2 text-xs text-ink-2 transition hover:bg-surface-2"
            @click="staged = null"
          >取消</button>
          <button
            type="button"
            :disabled="pluginBusy"
            class="rounded-xl bg-gradient-to-br from-accent-500 to-accent-400 px-4 py-2 text-xs text-white shadow-sm transition active:opacity-85 disabled:opacity-50"
            @click="confirmInstall"
          >{{ pluginBusy ? '安装中…' : '确认安装' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
