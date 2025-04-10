import { Home, MessageSquare, Code, PlugZap, Diamond, BookOpenCheckIcon } from "lucide-react";

export const ENV_URL = process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://fixfx.wiki";
export const DISCORD_LINK = "https://discord.gg/saK4hyXxMN";
export const GITHUB_ORG = "https://github.com/FixFXOSS";
export const GITHUB_LINK = "https://github.com/FixFXOSS/Website";
export const DOCS_URL = "https://fixfx.wiki";

export const GIT_OWNER = "FixFXOSS";
export const GIT_REPO = "Website";
export const GIT_SHA = "master";

// Navigation links configuration for use across the app
export const NAV_LINKS = [
    {
        name: "Home",
        href: "/",
        icon: Home,
        external: false
    },
    {
        name: "Fixie AI",
        href: "/chat",
        icon: MessageSquare,
        external: false
    },
    {
        name: "Natives",
        href: "/natives",
        icon: Code,
        external: false
    },
    {
        name: "Artifacts",
        href: "/artifacts",
        icon: PlugZap,
        external: false
    },
    {
        name: "Docs",
        href: "/docs/core",
        icon: Diamond,
        external: false
    },
    {
        name: "Blog",
        href: "/blog",
        icon: BookOpenCheckIcon,
        external: false
    }
];
