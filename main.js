// ---------- DOM 引用 ----------
const form = document.getElementById("loginForm");
const accountInput = document.getElementById("account");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const messageBox = document.getElementById("messageBox");

const LOGIN_URL =
  "https://apit.qmpsu.com/v3/login?platform=android&version=8.4.0";
const BASE_MISSION_URL = "https://api.atzxyff.com/vw3/202406/mission/";
const CHECK_IN_URL = "https://api.atzxyff.com/vw3/mission/check_in";
const MISSION_CENTER_URL = "https://apit.fucgq.com/vw3/mission_center";
// ---------- 辅助：显示消息（替代 alert） ----------
function showMessage(text, type = "error") {
  messageBox.textContent = text;
  messageBox.className = "message-box " + type; // 自动显示
  // 5秒后自动隐藏
  clearTimeout(window._msgTimer);
  window._msgTimer = setTimeout(() => {
    messageBox.className = "message-box";
  }, 5000);
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
// ---------- 表单提交 ----------
form.addEventListener("submit", async function (e) {
  e.preventDefault(); // 阻止页面刷新

  // 1. 取值并校验
  const account = accountInput.value.trim();
  const password = passwordInput.value.trim();

  if (!account || !password) {
    showMessage("⚠️ 账号和密码都不能为空", "error");
    return;
  }
  if (password.length < 6) {
    showMessage("⚠️ 密码至少需要 6 位", "error");
    return;
  }

  // 2. 按钮加载状态
  loginBtn.disabled = true;
  loginBtn.classList.add("loading");

  // 3. 构造 JSON
  const requestBody = { account, password };
  const jsonString = JSON.stringify(requestBody);

  try {
    const response = await fetch(LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonString,
    });

    // 解析响应（无论 HTTP 状态如何）
    const result = await response.json();

    // 4. 根据业务字段判断
    if (result.success === true) {
      // ✅ 成功
      const token = result.token;
      localStorage.setItem("token", token);
      const userInfo = parseJWTPayload(token);
      showMessage("✅ 登录成功！欢迎回来 " + userInfo.name, "success");

      // 领取该网站的VIP天数
      const headers = {
        "Content-Type": "application/json",
        "Access-Token": `Bearer ${token}`,
      };

      try {
        if (userInfo.is_sign) {
          showMessage("今天已经签到过了");
          return;
        }
        // 没有签到：先执行签到任务，确认签到成功后再执行其它 mission
        const checkInResp = await fetch(CHECK_IN_URL, {
          headers,
          method: "POST",
        });
        // 注意：HTTP 200 不代表业务成功，需读取响应体校验 success 字段
        const checkInResult = await checkInResp.json().catch(() => null);
        if (!checkInResult || checkInResult.success !== true) {
          console.error("签到失败:", checkInResult);
          const failMsg = (checkInResult && checkInResult.msg) || "请稍后重试";
          showMessage("⚠️ 签到失败：" + failMsg, "error");
          return; // 签到未成功：中断，不再执行其它 mission
        }
        // 签到成功后再领取其它 mission
        fetch(MISSION_CENTER_URL, { headers, method: "GET" }).then((r) => {
          r.json().then((missions) => {
            for (const missionType in missions) {
              if (!Object.hasOwn(missions, missionType)) continue;
              const mission = missions[missionType];
              if (Array.isArray(mission)) {
                mission.forEach((v) => {
                  if (!v.is_get) {
                    fetch(`${BASE_MISSION_URL}${missionType}/${v.task_code}`, {
                      headers,
                      method: "GET",
                    }).then((r) => {
                      r.json().then((result) => {
                        if (result.success === true) {
                          console.log("✅ 任务领取成功！");
                        } else {
                          console.error(
                            "⚠️ 任务领取失败：" + result.msg,
                            "error",
                          );
                        }
                      });
                    });
                  }
                });
              }
            }
          });
        });
      } catch (err) {
        console.error("领取任务异常:", err);
        showMessage("⚠️ 部分任务领取失败，请稍后手动尝试", "error");
      }
    } else {
      // ❌ 业务失败（账号密码错误等）
      showMessage("❌ " + (result.msg || "登录失败，请重试"), "error");
    }
  } catch (error) {
    // 网络异常或 JSON 解析异常
    console.error("请求异常:", error);
    showMessage("⚠️ 网络异常，请检查连接后重试", "error");
  } finally {
    // 恢复按钮状态
    loginBtn.disabled = false;
    loginBtn.classList.remove("loading");
  }
});

// ---------- （可选）按回车触发表单（默认已支持） ----------
