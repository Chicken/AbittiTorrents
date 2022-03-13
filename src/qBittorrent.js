import fetch from "node-fetch";
import https from "https";
import http from "http";
import FormData from "form-data";

class qBittorrent {
    constructor({
        host = "http://localhost:8080",
        insecure = false,
        user = "admin",
        password = "adminadmin",
    } = {}) {
        this.user = user;
        this.password = password;
        const parsedHost = new URL(host);
        if (!["http:", "https:"].includes(parsedHost.protocol))
            throw new Error(`Invalid protocol "${parsedHost.protocol}"!`);
        this.host = parsedHost.href;
        this.agent =
            parsedHost.protocol === "http:"
                ? new http.Agent()
                : new https.Agent({ rejectUnauthorized: !insecure });
        this.session = "";
        this.exp = null;
        this.defer = this.login(user, password);
        this.user = user;
        this.password = password;
    }

    async login(user, pass) {
        this.session = "";
        this.exp = null;
        const res = await this.fetch("auth/login", {
            method: "POST",
            body: `username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });
        const session = res.headers.get("set-cookie")?.split(";")?.[0];
        if (!session) {
            throw new Error("Invalid credentials");
        }
        this.session = session;
        this.exp = Date.now() + 55 * 60 * 1000;
    }

    async checkLogin() {
        await this.defer;
        if (Date.now() > this.exp) {
            this.defer = this.login(this.user, this.password);
            await this.defer;
        }
    }

    async fetch(url, opts = { headers: {} }) {
        const res = await fetch(`${this.host}api/v2/${url}`, {
            ...opts,
            headers: {
                ...opts.headers,
                Cookie: this.session,
            },
            referrer: this.host,
            agent: this.agent,
        });
        return res;
    }

    async addTorrent(file, category) {
        await this.checkLogin();
        const data = new FormData();
        data.append("torrents", file, { type: "application/x-bittorrent", filename: "abitti.torrent" });
        if (category) data.append("category", category);
        const res = await this.fetch("torrents/add", {
            method: "POST",
            body: data,
        });
        switch (res.status) {
            case 200:
                return "Success";
            case 415:
                throw new Error("Invalid torrent");
            default:
                throw new Error(`Unexpected response status ${res.status}.`);
        }
    }
}

export default qBittorrent;
