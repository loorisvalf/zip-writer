var background = {
  "port": null,
  "message": {},
  "receive": function (id, callback) {
    if (id) {
      background.message[id] = callback;
    }
  },
  "connect": function (port) {
    chrome.runtime.onMessage.addListener(background.listener); 
    /*  */
    if (port) {
      background.port = port;
      background.port.onMessage.addListener(background.listener);
      background.port.onDisconnect.addListener(function () {
        background.port = null;
      });
    }
  },
  "post": function (id, data) {
    if (id) {
      if (background.port) {
        background.port.postMessage({
          "method": id,
          "data": data,
          "port": background.port.name,
          "path": "popup-to-background"
        });
      }
    }
  },
  "send": function (id, data) {
    if (id) {
      if (background.port) {
        if (background.port.name !== "webapp") {
          chrome.runtime.sendMessage({
            "method": id,
            "data": data,
            "path": "popup-to-background"
          }, function () {
            return chrome.runtime.lastError;
          });
        }
      }
    }
  },
  "listener": function (e) {
    if (e) {
      for (let id in background.message) {
        if (background.message[id]) {
          if ((typeof background.message[id]) === "function") {
            if (e.path === "background-to-popup") {
              if (e.method === id) {
                background.message[id](e.data);
              }
            }
          }
        }
      }
    }
  }
};

var config = {
  "prevent": {
    "drop": function (e) {
      if (e.target.id.indexOf("fileio") !== -1) return;
      e.preventDefault();
    }
  },
  "addon": {
    "homepage": function () {
      return chrome.runtime.getManifest().homepage_url;
    }
  },
  "resize": {
    "timeout": null,
    "method": function () {
      if (config.port.name === "win") {
        if (config.resize.timeout) window.clearTimeout(config.resize.timeout);
        config.resize.timeout = window.setTimeout(async function () {
          const current = await chrome.windows.getCurrent();
          /*  */
          config.storage.write("interface.size", {
            "top": current.top,
            "left": current.left,
            "width": current.width,
            "height": current.height
          });
        }, 1000);
      }
    }
  },
  "port": {
    "name": '',
    "connect": function () {
      config.port.name = "webapp";
      const context = document.documentElement.getAttribute("context");
      /*  */
      if (chrome.runtime) {
        if (chrome.runtime.connect) {
          if (context !== config.port.name) {
            if (document.location.search === "?tab") config.port.name = "tab";
            if (document.location.search === "?win") config.port.name = "win";
            /*  */
            chrome.runtime.connect({
              "name": config.port.name
            });
          }
        }
      }
      /*  */
      document.documentElement.setAttribute("context", config.port.name);
    }
  },
  "storage": {
    "local": {},
    "read": function (id) {
      return config.storage.local[id];
    },
    "load": function (callback) {
      chrome.storage.local.get(null, function (e) {
        config.storage.local = e;
        callback();
      });
    },
    "write": function (id, data) {
      if (id) {
        if (data !== '' && data !== null && data !== undefined) {
          let tmp = {};
          tmp[id] = data;
          config.storage.local[id] = data;
          chrome.storage.local.set(tmp, function () {});
        } else {
          delete config.storage.local[id];
          chrome.storage.local.remove(id, function () {});
        }
      }
    }
  },
  "clean": {
    "primary": function () {
      const fileio = document.getElementById("fileio");
      const filelist = document.getElementById("filelist");
      /*  */
      delete config.zip.blob;
      fileio.disabled = true;
      filelist.textContent = '';
      config.zip.buffer.files = [];
      config.zip.buffer.entries = [];
      config.zip.buffer.fullpath = [];
    },
    "secondary": function () {
      const fileio = document.getElementById("fileio");
      const filelist = document.getElementById("filelist");
      /*  */
      fileio.disabled = false;
      window.setTimeout(function () {
        filelist.scrollTo({"top": 0, "behavior": "smooth"});
      }, 300);
    }
  },
  "fileio": {
    "api": undefined,
    "picker": undefined,
    "permission": undefined,
    "read": {
      "file": async function (entry) {
        await new Promise(resolve => {
          if (entry) {
            entry.file(function (file) {
              config.zip.buffer.files.push(file);
              config.zip.buffer.fullpath.push(entry.fullPath);
              /*  */ 
              resolve();
            });
          }
        });
      },
      "directory": async function (e) {
        await new Promise(resolve => {
          if (e) {
            config.zip.buffer.entries.push(e);
            /*  */
            const reader = e.createReader();
            if (reader) {
              reader.readEntries(async function (entries) {
                if (entries) {
                  for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i];
                    if (entry.isFile) {
                      await config.fileio.read.file(entry);
                    } else if (entry.isDirectory) {
                      await config.fileio.read.directory(entry);
                    } else {
                      config.zip.onerror("Error >> readEntries");
                    }
                  }
                }
                /*  */
                resolve();
              });
            }
          }
        });
      }
    }
  },
  "download": {
    "initiate": async function (callback) {
      config.fileio.api = window.showDirectoryPicker ? "supported" : "unsupported";
      if (config.fileio.api === "supported") {
        try {
          if (!config.fileio.picker) config.fileio.picker = await window.showDirectoryPicker();
          config.fileio.permission = await config.fileio.picker.requestPermission({"mode": "readwrite"});
        } catch (e) {}
      }
      /*  */
      if (callback) callback();
    },
    "start": async function (blob, path, filename, callback) {
      if (config.fileio.api === "supported") {
        if (config.fileio.permission === "granted") {
          try {
            let root = config.fileio.picker;
            let arr = path.split('/');
            let name = arr.pop();
            let target = null;
            let subdir = null;
            /*  */
            for (let i = 0; i < arr.length; i++) {
              target = subdir ? subdir : root;
              subdir = await target.getDirectoryHandle(arr[i], {"create": true});
            }
            /*  */
            target = subdir ? subdir : root;
            name = name.endsWith(".zip") ? name : name + ".zip";
            const file = await target.getFileHandle(name, {"create": true});
            const writable = await file.createWritable();
            /*  */
            await writable.write(blob);
            writable.close();
          } catch (e) {
            config.zip.onerror("Error >> FileSystem API");
          }
        }
      } else {
        const url = URL.createObjectURL(blob);
        filename = filename.endsWith(".zip") ? filename : filename + ".zip";
        /*  */
        if (chrome && chrome.permissions) {
          const granted = await chrome.permissions.request({"permissions": ["downloads"]});
          if (granted) {
            await chrome.downloads.download({"url": url, "filename": filename});
          }
        } else {
          const a = document.createElement('a');
          a.setAttribute("download", filename);
          a.setAttribute("href", url);
          a.click();
          /*  */
          URL.revokeObjectURL(url);
        }
      }
      /*  */
      const arr = [...filelist.querySelectorAll("progress")];
      for (let i = 0; i < arr.length; i++) {
        await new Promise(resolve => {
          arr[i].scrollIntoView({"behavior": "auto", "block": "center", "inline": "center"});
          window.setTimeout(resolve, 30);
          arr[i].remove();
        });
      }
      /*  */
      if (callback) callback();
    }
  },
	"zip": {
    "blob": null,
    "writer": null,
    "buffer": {
      "files": [], 
      "entries": [], 
      "fullpath": []
    },
    "onerror": function (e) {alert(e)},
    "onprogress": function (current, total, target) {
      if (target) {
        const progress = document.createElement("progress");
        /*  */
        progress.max = total;
        progress.value = current;
        target.appendChild(progress);
        target.scrollIntoView({"behavior": "auto", "block": "center", "inline": "center"});
      }
    },
    "model": {
      "blob": async function (callback) {
        if (config.zip.blob) callback();
        else {
          if (config.zip.writer) {
            config.zip.blob = await config.zip.writer.close();
            /*  */
            delete config.zip.writer;
            callback();
          }
        }
      },
      "files": {
        "add": function (files, callback) {
          let count = 0;
          /*  */
          const loop = async function (file) {
            if (config.zip.writer) {
              const li = document.createElement("li");
              const relativepath = file.webkitRelativePath;
              const fullpath = config.zip.buffer.fullpath[count];
              const filelist = document.getElementById("filelist");
              const path = fullpath ? fullpath : (relativepath ? relativepath : file.name);
              /*  */
              li.textContent = path;
              filelist.appendChild(li);
              /*  */
              const reader = new zip.BlobReader(file);
              await config.zip.writer.add(path, reader, {
                "onprogress": function (current, total) {
                  config.zip.onprogress(current, total, li);
                }
              });
              /*  */
              count = count + 1;
              files.length ? loop(files.shift()) : callback();
            }
          };
          /*  */
          config.zip.writer = new zip.ZipWriter(new zip.BlobWriter("application/zip"));
          files.length ? loop(files.shift()) : callback();
        }
      }
  	}
	},
  "load": function () {
    const reload = document.getElementById("reload");
    const fileio = document.getElementById("fileio");
    const support = document.getElementById("support");
    const donation = document.getElementById("donation");
    const filename = document.getElementById("filename");
    const download = document.getElementById("download");
    /*  */
    reload.addEventListener("click", function () {
      document.location.reload();
    });
    /*  */
    support.addEventListener("click", function () {
      if (config.port.name !== "webapp") {
        const url = config.addon.homepage();
        chrome.tabs.create({"url": url, "active": true});
      }
    }, false);
    /*  */
    donation.addEventListener("click", function () {
      if (config.port.name !== "webapp") {
        const url = config.addon.homepage() + "?reason=support";
        chrome.tabs.create({"url": url, "active": true});
      }
    }, false);
    /*  */
    fileio.addEventListener("change", function (e) {
      config.clean.primary();
      /*  */
      config.zip.buffer.files = [...e.target.files];
      config.zip.model.files.add(config.zip.buffer.files, config.clean.secondary);
    }, false);
    /*  */
    download.addEventListener("click", function () {
      config.zip.model.blob(function () {
        if (config.zip.blob) {
          config.zip.path = filename.value || "result.zip";
          config.zip.filename = filename.value || "result.zip";
          /*  */
          download.setAttribute("processing", '');
          download.value = "Processing, please wait...";
          /*  */
          config.download.initiate(function () {
            config.download.start(config.zip.blob, config.zip.path, config.zip.filename, function () {
              window.setTimeout(function () {
                download.value = "Zip & Download";
                download.removeAttribute("processing");
                filelist.scrollTo({"top": 0, "behavior": "smooth"});
              }, 300);
            });
          });
        }
      });
    }, false);
    /*  */
    fileio.addEventListener("drop", async function (e) {
      e.preventDefault();
      config.clean.primary();
      /*  */
      const entries = [];
      const items = [...e.dataTransfer.items];
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          entries.push(item.webkitGetAsEntry !== undefined ? item.webkitGetAsEntry() : (item.getAsEntry !== undefined ? item.getAsEntry() : null));
        }
        /*  */
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (entry) {
            if (entry.isFile) {
              await config.fileio.read.file(entry);
            } else if (entry.isDirectory) {
              await config.fileio.read.directory(entry);
            } else {
              config.zip.onerror("Error >> webkitGetAsEntry");
            }
          }
        }
      }
      /*  */
      config.zip.model.files.add(config.zip.buffer.files, config.clean.secondary);
    });
    /*  */
    window.removeEventListener("load", config.load, false);
  }
};

config.port.connect();

window.addEventListener("load", config.load, false);
document.addEventListener("drop", config.prevent.drop, true);
window.addEventListener("resize", config.resize.method, false);
document.addEventListener("dragover", config.prevent.drop, true);
