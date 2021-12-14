var background = (function () {
  var tmp = {};
  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (request) {
      for (var id in tmp) {
        if (tmp[id] && (typeof tmp[id] === "function")) {
          if (request.path === "background-to-popup") {
            if (request.method === id) tmp[id](request.data);
          }
        }
      }
    });
    /*  */
    return {
      "receive": function (id, callback) {tmp[id] = callback},
      "send": function (id, data) {
        chrome.runtime.sendMessage({"path": "popup-to-background", "method": id, "data": data});
      }
    }
  } else {
    return {
      "send": function () {},
      "receive": function () {}
    }
  }
})();

var config = {
  "prevent": {
    "drop": function (e) {
      if (e.target.id.indexOf("fileio") !== -1) return;
      e.preventDefault();
    }
  },
  "resize": {
    "timeout": null,
    "method": function () {
      if (config.port.name === "win") {
        if (config.resize.timeout) window.clearTimeout(config.resize.timeout);
        config.resize.timeout = window.setTimeout(async function () {
          var current = await chrome.windows.getCurrent();
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
      var context = document.documentElement.getAttribute("context");
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
          var tmp = {};
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
      var fileio = document.getElementById("fileio");
      var filelist = document.getElementById("filelist");
      /*  */
      delete config.zip.blob;
      fileio.disabled = true;
      filelist.textContent = '';
      config.zip.buffer.files = [];
      config.zip.buffer.entries = [];
      config.zip.buffer.fullpath = [];
    },
    "secondary": function () {
      var fileio = document.getElementById("fileio");
      var filelist = document.getElementById("filelist");
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
            var reader = e.createReader();
            if (reader) {
              reader.readEntries(async function (entries) {
                if (entries) {
                  for (var i = 0; i < entries.length; i++) {
                    var entry = entries[i];
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
            const root = config.fileio.picker;
            const arr = path.split('/');
            const name = arr.pop();
            let subdir = null;
            /*  */
            for (var i = 0; i < arr.length; i++) {
              var target = subdir ? subdir : root;
              subdir = await target.getDirectoryHandle(arr[i], {"create": true});
            }
            /*  */
            var target = subdir ? subdir : root;
            var file = await target.getFileHandle(name, {"create": true});
            var writable = await file.createWritable();
            /*  */
            await writable.write(blob);
            writable.close();
          } catch (e) {
            config.zip.onerror("Error >> FileSystem API");
          }
        }
      } else {
        var url = URL.createObjectURL(blob);
        /*  */
        if (chrome && chrome.permissions) {
          var granted = await chrome.permissions.request({"permissions": ["downloads"]});
          if (granted) {
            await chrome.downloads.download({"url": url, "filename": path});
          }
        } else {
          var a = document.createElement('a');
          a.setAttribute("download", path);
          a.setAttribute("href", url);
          a.click();
          /*  */
          URL.revokeObjectURL(url);
        }
      }
      /*  */
      var arr = [...filelist.querySelectorAll("progress")];
      for (var i = 0; i < arr.length; i++) {
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
        var progress = document.createElement("progress");
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
          var count = 0;
          var loop = async function (file) {
            if (config.zip.writer) {
              var li = document.createElement("li");
              var relativepath = file.webkitRelativePath;
              var fullpath = config.zip.buffer.fullpath[count];
              var filelist = document.getElementById("filelist");
              var path = fullpath ? fullpath : (relativepath ? relativepath : file.name);
              /*  */
              li.textContent = path;
              filelist.appendChild(li);
              /*  */
              var reader = new zip.BlobReader(file);
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
    var reload = document.getElementById("reload");
    var fileio = document.getElementById("fileio");
    var support = document.getElementById("support");
    var donation = document.getElementById("donation");
    var filename = document.getElementById("filename");
    var download = document.getElementById("download");
    /*  */
    reload.addEventListener("click", function () {
      document.location.reload();
    });
    /*  */
    support.addEventListener("click", function () {
      if (config.port.name !== "webapp") {
        var url = config.addon.homepage();
        chrome.tabs.create({"url": url, "active": true});
      }
    }, false);
    /*  */
    donation.addEventListener("click", function () {
      if (config.port.name !== "webapp") {
        var url = config.addon.homepage() + "?reason=support";
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
      var entries = [];
      var items = [...e.dataTransfer.items];
      if (items) {
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          entries.push(item.webkitGetAsEntry !== undefined ? item.webkitGetAsEntry() : (item.getAsEntry !== undefined ? item.getAsEntry() : null));
        }
        /*  */
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
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
