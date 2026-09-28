const API_BASE = "https://api.wordpress.org/plugins/info/1.2/";

const form = document.getElementById("compatibilityForm");
const pluginQueryInput = document.getElementById("pluginQuery");
const wordpressVersionSelect = document.getElementById("wordpressVersion");
const phpVersionSelect = document.getElementById("phpVersion");
const searchButton = document.getElementById("searchButton");
const checkButton = document.getElementById("checkButton");
const searchResults = document.getElementById("searchResults");
const selectedPluginBox = document.getElementById("selectedPlugin");
const statusArea = document.getElementById("statusArea");
const resultArea = document.getElementById("resultArea");

let selectedPlugin = null;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeVersion(version) {
  if (!version) {
    return null;
  }

  const match = String(version).match(/\d+(?:\.\d+){0,3}/);

  return match ? match[0] : null;
}

function compareVersions(left, right) {
  const leftParts = String(left).split(".").map(Number);
  const rightParts = String(right).split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] || 0;
    const rightPart = rightParts[index] || 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
}

function getPluginUrl(plugin) {
  const slug = plugin.slug || "";
  return `https://wordpress.org/plugins/${encodeURIComponent(slug)}/`;
}

function setLoading(isLoading, message = "") {
  searchButton.disabled = isLoading;
  checkButton.disabled = isLoading;

  if (message) {
    statusArea.innerHTML = `<div class="status-message">${escapeHtml(message)}</div>`;
  } else {
    statusArea.innerHTML = "";
  }
}

async function wordpressApiRequest(parameters) {
  const url = new URL(API_BASE);
  url.search = new URLSearchParams(parameters).toString();

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`WordPress.org API returned HTTP ${response.status}.`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

function clearResult() {
  resultArea.innerHTML = "";
  resultArea.classList.add("hidden");
}

function renderSearchResults(plugins) {
  if (!plugins.length) {
    searchResults.innerHTML = `
      <div class="status-message">
        No WordPress.org plugins were found. Try a different plugin name or slug.
      </div>
    `;
    searchResults.classList.remove("hidden");
    return;
  }

  searchResults.innerHTML = plugins.map((plugin) => {
    const name = escapeHtml(plugin.name || plugin.slug);
    const slug = escapeHtml(plugin.slug || "");
    const version = escapeHtml(plugin.version || "Unknown version");
    const tested = escapeHtml(plugin.tested || "Not declared");

    return `
      <button
        type="button"
        class="search-result-button"
        data-slug="${slug}"
        aria-label="Select ${name}"
      >
        <span class="search-result-title">${name}</span>
        <span class="search-result-meta">
          Slug: ${slug} · Version: ${version} · Tested up to: ${tested}
        </span>
      </button>
    `;
  }).join("");

  searchResults.classList.remove("hidden");

  document.querySelectorAll(".search-result-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const slug = button.dataset.slug;
      await selectPluginBySlug(slug);
    });
  });
}

async function searchPlugins() {
  const query = pluginQueryInput.value.trim();

  clearResult();
  selectedPlugin = null;
  selectedPluginBox.textContent = "Search and select a WordPress.org plugin first.";
  selectedPluginBox.classList.remove("active");
  searchResults.classList.add("hidden");
  searchResults.innerHTML = "";

  if (!query) {
    statusArea.innerHTML = `
      <div class="status-message">
        Enter a plugin name or WordPress.org plugin slug first.
      </div>
    `;
    pluginQueryInput.focus();
    return;
  }

  try {
    setLoading(true, "Searching WordPress.org plugins…");

    const data = await wordpressApiRequest({
      action: "query_plugins",
      "request[search]": query,
      "request[per_page]": "10",
      "request[fields][requires]": "1",
      "request[fields][tested]": "1",
      "request[fields][requires_php]": "1"
    });

    renderSearchResults(data.plugins || []);
    statusArea.innerHTML = "";
  } catch (error) {
    statusArea.innerHTML = `
      <div class="status-message">
        Search failed: ${escapeHtml(error.message)}
      </div>
    `;
  } finally {
    setLoading(false);
  }
}

async function selectPluginBySlug(slug) {
  try {
    setLoading(true, "Loading selected plugin information…");

    const plugin = await wordpressApiRequest({
      action: "plugin_information",
      "request[slug]": slug,
      "request[fields][requires]": "1",
      "request[fields][tested]": "1",
      "request[fields][requires_php]": "1",
      "request[fields][last_updated]": "1",
      "request[fields][downloaded]": "1",
      "request[fields][active_installs]": "1",
      "request[fields][versions]": "1"
    });

    selectedPlugin = plugin;
    pluginQueryInput.value = plugin.name || slug;

    selectedPluginBox.innerHTML = `
      <strong>${escapeHtml(plugin.name || slug)}</strong>
      — slug: <code>${escapeHtml(plugin.slug || slug)}</code>
      — latest version: ${escapeHtml(plugin.version || "Unknown")}
    `;
    selectedPluginBox.classList.add("active");

    searchResults.classList.add("hidden");
    searchResults.innerHTML = "";
    statusArea.innerHTML = "";
  } catch (error) {
    statusArea.innerHTML = `
      <div class="status-message">
        Could not load plugin information: ${escapeHtml(error.message)}
      </div>
    `;
  } finally {
    setLoading(false);
  }
}

function getCheckStatus(label, type, message) {
  return {
    label,
    type,
    message
  };
}

function evaluateCompatibility(plugin, selectedWp, selectedPhp) {
  const requiredWp = normalizeVersion(plugin.requires);
  const testedWp = normalizeVersion(plugin.tested);
  const requiredPhp = normalizeVersion(plugin.requires_php);

  const checks = [];

  if (requiredWp) {
    if (compareVersions(selectedWp, requiredWp) < 0) {
      checks.push(
        getCheckStatus(
          "WordPress minimum requirement",
          "fail",
          `FAIL — Plugin requires WordPress ${requiredWp} or newer; selected WordPress is ${selectedWp}.`
        )
      );
    } else {
      checks.push(
        getCheckStatus(
          "WordPress minimum requirement",
          "pass",
          `PASS — Selected WordPress ${selectedWp} meets the minimum requirement of ${requiredWp}.`
        )
      );
    }
  } else {
    checks.push(
      getCheckStatus(
        "WordPress minimum requirement",
        "warning",
        "WARNING — The plugin does not publish a detectable minimum WordPress version."
      )
    );
  }

  if (requiredPhp) {
    if (compareVersions(selectedPhp, requiredPhp) < 0) {
      checks.push(
        getCheckStatus(
          "PHP minimum requirement",
          "fail",
          `FAIL — Plugin requires PHP ${requiredPhp} or newer; selected PHP is ${selectedPhp}.`
        )
      );
    } else {
      checks.push(
        getCheckStatus(
          "PHP minimum requirement",
          "pass",
          `PASS — Selected PHP ${selectedPhp} meets the minimum requirement of ${requiredPhp}.`
        )
      );
    }
  } else {
    checks.push(
      getCheckStatus(
        "PHP minimum requirement",
        "warning",
        "WARNING — The plugin does not publish a detectable minimum PHP version."
      )
    );
  }

  if (testedWp) {
    if (compareVersions(selectedWp, testedWp) > 0) {
      checks.push(
        getCheckStatus(
          "WordPress tested-up-to version",
          "warning",
          `WARNING — Selected WordPress ${selectedWp} is newer than the plugin’s declared “Tested up to” value of ${testedWp}.`
        )
      );
    } else {
      checks.push(
        getCheckStatus(
          "WordPress tested-up-to version",
          "pass",
          `PASS — Selected WordPress ${selectedWp} is within the plugin’s declared tested version (${testedWp}).`
        )
      );
    }
  } else {
    checks.push(
      getCheckStatus(
        "WordPress tested-up-to version",
        "warning",
        "WARNING — The plugin does not publish a detectable “Tested up to” version."
      )
    );
  }

  const failedChecks = checks.filter((check) => check.type === "fail");
  const warningChecks = checks.filter((check) => check.type === "warning");

  let overallStatus = "PASS";
  let overallClass = "pass";
  let overallMessage = "Declared plugin metadata is compatible with the selected WordPress and PHP versions.";

  if (failedChecks.length > 0) {
    overallStatus = "FAIL";
    overallClass = "fail";
    overallMessage = "The selected environment does not meet one or more declared plugin requirements.";
  } else if (warningChecks.length > 0) {
    overallStatus = "WARNING";
    overallClass = "warning";
    overallMessage = "The minimum requirements pass, but compatibility cannot be fully confirmed from published metadata.";
  }

  return {
    checks,
    overallStatus,
    overallClass,
    overallMessage,
    requiredWp: requiredWp || "Not declared",
    testedWp: testedWp || "Not declared",
    requiredPhp: requiredPhp || "Not declared"
  };
}

function renderCompatibilityResult(plugin, selectedWp, selectedPhp, result) {
  const pluginName = escapeHtml(plugin.name || plugin.slug);
  const pluginUrl = getPluginUrl(plugin);
  const latestVersion = escapeHtml(plugin.version || "Unknown");
  const lastUpdated = escapeHtml(plugin.last_updated || "Unknown");

  const checksHtml = result.checks.map((check) => `
    <li class="check-${check.type}">
      <strong>${escapeHtml(check.label)}:</strong> ${escapeHtml(check.message)}
    </li>
  `).join("");

  resultArea.innerHTML = `
    <article class="result-card">
      <div class="result-heading">
        <div>
          <h2>${pluginName}</h2>
          <a class="plugin-link" href="${pluginUrl}" target="_blank" rel="noopener noreferrer">
            View plugin on WordPress.org
          </a>
        </div>
        <span class="badge badge-${result.overallClass}">${result.overallStatus}</span>
      </div>

      <p>${escapeHtml(result.overallMessage)}</p>

      <table class="compatibility-table">
        <tbody>
          <tr>
            <th>Selected WordPress</th>
            <td>${escapeHtml(selectedWp)}</td>
          </tr>
          <tr>
            <th>Selected PHP</th>
            <td>${escapeHtml(selectedPhp)}</td>
          </tr>
          <tr>
            <th>Plugin version</th>
            <td>${latestVersion}</td>
          </tr>
          <tr>
            <th>Requires WordPress</th>
            <td>${escapeHtml(result.requiredWp)}</td>
          </tr>
          <tr>
            <th>Tested up to</th>
            <td>${escapeHtml(result.testedWp)}</td>
          </tr>
          <tr>
            <th>Requires PHP</th>
            <td>${escapeHtml(result.requiredPhp)}</td>
          </tr>
          <tr>
            <th>Last updated</th>
            <td>${lastUpdated}</td>
          </tr>
        </tbody>
      </table>

      <ul class="check-list">
        ${checksHtml}
      </ul>

      <p class="disclaimer">
        <strong>Production warning:</strong> This result compares published WordPress.org metadata only.
        It cannot detect conflicts with your theme, custom code, other plugins, database migrations,
        PHP extensions, caching layers, or server configuration. Take a backup and test on staging
        before updating production.
      </p>
    </article>
  `;

  resultArea.classList.remove("hidden");
}

async function checkCompatibility() {
  clearResult();

  const selectedWp = wordpressVersionSelect.value;
  const selectedPhp = phpVersionSelect.value;

  if (!selectedPlugin) {
    statusArea.innerHTML = `
      <div class="status-message">
        Search for and select a WordPress.org plugin first.
      </div>
    `;
    return;
  }

  if (!selectedWp || !selectedPhp) {
    statusArea.innerHTML = `
      <div class="status-message">
        Select both a WordPress version and a PHP version before checking.
      </div>
    `;
    return;
  }

  try {
    setLoading(true, "Refreshing plugin metadata from WordPress.org…");

    const plugin = await wordpressApiRequest({
      action: "plugin_information",
      "request[slug]": selectedPlugin.slug,
      "request[fields][requires]": "1",
      "request[fields][tested]": "1",
      "request[fields][requires_php]": "1",
      "request[fields][last_updated]": "1"
    });

    selectedPlugin = plugin;

    const result = evaluateCompatibility(plugin, selectedWp, selectedPhp);

    renderCompatibilityResult(plugin, selectedWp, selectedPhp, result);
    statusArea.innerHTML = "";
  } catch (error) {
    statusArea.innerHTML = `
      <div class="status-message">
        Compatibility check failed: ${escapeHtml(error.message)}
      </div>
    `;
  } finally {
    setLoading(false);
  }
}

searchButton.addEventListener("click", searchPlugins);

pluginQueryInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchPlugins();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  checkCompatibility();
});
