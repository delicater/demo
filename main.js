// ---------- 常量配置 ----------
const API = Object.freeze({
  LOGIN: "https://apit.qmpsu.com/v3/login?platform=pwa&version=1.0.0",
  MISSION_BASE: "https://api.atzxyff.com/vw3/202406/mission/",
  CHECK_IN: "https://api.atzxyff.com/vw3/mission/check_in",
  MISSION_CENTER: "https://apit.fucgq.com/vw3/mission_center",
  DRAW_START: "https://apit.fucgq.com/vw3/draw/start",
  LOGOUT: "https://apit.fucgq.com/vw3/logout",
});

// ---------- DOM 引用 ----------
const $ = (id) => document.getElementById(id);

const ui = {
  form: $("loginForm"),
  account: $("account"),
  password: $("password"),
  loginBtn: $("loginBtn"),
  messageBox: $("messageBox"),
  loginCard: $("loginCard"),
  drawCard: $("drawCard"),
  drawBtn: $("drawBtn"),
  drawCount: $("drawCount"),
  drawMsg: $("drawMsg"),
  drawResult: $("drawResult"),
  logoutBtn: $("logoutBtn"),
};

// ---------- token 存取 ----------
const auth = {
  get token() {
    return localStorage.getItem("token");
  },
  save(token) {
    localStorage.setItem("token", token);
  },
  clear() {
    localStorage.removeItem("token");
  },
};

// ---------- 通用工具 ----------
// 提示消息（替代 alert），5 秒后自动隐藏
const msgTimers = new Map();
function showMessage(box, text, type = "error") {
  box.textContent = text;
  box.className = "message-box " + type;
  clearTimeout(msgTimers.get(box));
  msgTimers.set(
    box,
    setTimeout(() => {
      box.className = "message-box";
    }, 5000),
  );
}

// 按钮加载状态（禁用 + 转圈）
function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.classList.toggle("loading", loading);
}

// 带 token 的请求头
function authHeaders(token = auth.token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Access-Token"] = "Bearer " + token;
  return headers;
}

// fetch + JSON 解析（解析失败返回 null，由调用方处理）
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  return res.json().catch(() => null);
}

function parseJWTPayload(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("JWT 解析失败:", e);
    return null;
  }
}

// ---------- 登录状态视图切换 ----------
// token 存在 → 已登录：隐藏登录卡片、显示抽奖卡片；否则相反。
function applyAuthView() {
  const isLoggedIn = auth.token != null;
  ui.loginCard.hidden = isLoggedIn;
  ui.drawCard.hidden = !isLoggedIn;
}

// ---------- 登录 ----------
ui.form.addEventListener("submit", async function (e) {
  e.preventDefault(); // 阻止页面刷新

  // 1. 取值并校验
  const account = ui.account.value.trim();
  const password = ui.password.value.trim();

  if (!account || !password) {
    showMessage(ui.messageBox, "⚠️ 账号和密码都不能为空");
    return;
  }
  if (password.length < 6) {
    showMessage(ui.messageBox, "⚠️ 密码至少需要 6 位");
    return;
  }

  // 2. 按钮加载状态
  setLoading(ui.loginBtn, true);

  try {
    const result = await fetchJSON(API.LOGIN, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ account, password }),
    });

    // 3. 根据业务字段判断（验证码错误等失败后刷新图片，便于重试）
    if (!result || result.success !== true) {
      showMessage(
        ui.messageBox,
        "❌ " + ((result && result.msg) || "登录失败，请重试"),
      );
      return;
    }

    // ✅ 登录成功
    const token = result.token;
    auth.save(token);
    applyAuthView(); // 登录成功：隐藏登录卡片、显示抽奖卡片
    const userInfo = parseJWTPayload(token);
    // 登录成功后登录卡片已隐藏，提示需展示在抽奖卡片内（drawMsg）
    const name = userInfo && userInfo.name ? " " + userInfo.name : "";
    showMessage(ui.drawMsg, "✅ 登录成功！欢迎回来" + name, "success");

    try {
      if (userInfo && userInfo.is_sign) {
        showMessage(ui.drawMsg, "今天已经签到过了", "success");
        return;
      }
      await claimMissions(token);
    } catch (err) {
      console.error("领取任务异常:", err);
      showMessage(ui.drawMsg, "⚠️ 部分任务领取失败，请稍后手动尝试");
    }
  } catch (err) {
    // 网络异常
    console.error("请求异常:", err);
    showMessage(ui.messageBox, "⚠️ 网络异常，请检查连接后重试");
  } finally {
    // 恢复按钮状态
    setLoading(ui.loginBtn, false);
  }
});

// 领取该网站的签到 / 任务（先签到，无论成败都继续领其它 mission）
async function claimMissions(token) {
  const headers = authHeaders(token);

  // 先签到：HTTP 200 不代表业务成功，需读取响应体校验 success 字段
  const checkIn = await fetchJSON(API.CHECK_IN, { method: "POST", headers });
  if (!checkIn || checkIn.success !== true) {
    console.error("签到失败:", checkIn);
    showMessage(
      ui.drawMsg,
      "⚠️ 签到失败：" + ((checkIn && checkIn.msg) || "请稍后重试"),
    );
  }

  // 签到后继续领取其它 mission
  const missions = await fetchJSON(API.MISSION_CENTER, { method: "GET", headers });
  if (!missions) return;

  const tasks = [];
  for (const [missionType, mission] of Object.entries(missions)) {
    if (!Array.isArray(mission)) continue;
    for (const v of mission) {
      if (!v.is_get) tasks.push({ missionType, taskCode: v.task_code });
    }
  }

  // 并行领取，单个失败不影响其它任务
  const results = await Promise.allSettled(
    tasks.map(({ missionType, taskCode }) =>
      fetchJSON(API.MISSION_BASE + missionType + "/" + taskCode, {
        method: "GET",
        headers,
      }),
    ),
  );
  results.forEach((r) => {
    if (r.status === "fulfilled" && r.value && r.value.success === true) {
      console.log("✅ 任务领取成功！");
    } else {
      console.error(
        "⚠️ 任务领取失败：",
        r.status === "rejected" ? r.reason : r.value && r.value.msg,
      );
    }
  });
}

// ---------- 抽奖 ----------
async function sendDrawRequest(count) {
  // 复用登录后保存在 localStorage 中的 token
  const token = auth.token;
  if (!token) {
    showMessage(ui.drawMsg, "⚠️ 尚未登录，请先登录获取 token");
    return;
  }

  setLoading(ui.drawBtn, true);
  setDrawResult("请求中…");

  try {
    // 只发送服务端实际需要的关键头
    const result = await fetchJSON(API.DRAW_START, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ draw_count: count }),
    });

    setDrawResult(result ? JSON.stringify(result, null, 2) : "");

    if (result && result.success === true) {
      showMessage(ui.drawMsg, "✅ 抽奖请求成功", "success");
    } else {
      showMessage(ui.drawMsg, "⚠️ " + ((result && result.msg) || "抽奖失败"));
    }
  } catch (err) {
    console.error("抽奖请求异常:", err);
    setDrawResult("");
    // 可能是跨域(CORS)被拦截或网络异常
    showMessage(ui.drawMsg, "⚠️ 网络异常 / 跨域被拦截，请检查后重试");
  } finally {
    setLoading(ui.drawBtn, false);
  }
}

function setDrawResult(text) {
  ui.drawResult.textContent = text;
  ui.drawResult.classList.toggle("show", text !== "");
}

ui.drawBtn.addEventListener("click", function () {
  const count = parseFloat(ui.drawCount.value);
  if (isNaN(count) || !Number.isInteger(count)) {
    showMessage(ui.drawMsg, "⚠️ 请输入有效的整数抽奖次数");
    return;
  }
  sendDrawRequest(count);
});

// ---------- 退出登录 ----------
ui.logoutBtn.addEventListener("click", async function () {
  const token = auth.token;
  ui.logoutBtn.disabled = true;
  try {
    if (token) {
      await fetch(API.LOGOUT, { headers: authHeaders(token) });
    }
  } catch (err) {
    console.error("退出登录请求异常:", err);
  } finally {
    // 无论服务端是否成功，都清除本地 token 并回到登录界面
    auth.clear();
    applyAuthView();
    ui.logoutBtn.disabled = false;
    showMessage(ui.messageBox, "👋 已退出登录", "success");
  }
});

// ---------- 页面初始化 ----------
// 根据 token 决定显示登录界面还是抽奖界面
applyAuthView();
