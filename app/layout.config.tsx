import type { HomeLayoutProps } from "fumadocs-ui/layouts/home";
import { FixFXIcon } from "@ui/icons";
import { GITHUB_LINK } from "@/packages/utils/src";

export const baseOptions: HomeLayoutProps = {
  githubUrl: `${GITHUB_LINK}`,
  nav: {
    title: (
      <div className="flex flex-row items-center justify-center gap-x-2">
        <FixFXIcon className="size-6" />
        <p className="font-sans text-lg">FixFX</p>
      </div>
    ),
  },
  links: [
    {
      type: "menu",
      text: "Documentation",
      url: "/docs/core",
      items: [
        {
          menu: {
            banner: (
              <div className="flex h-20 w-full items-center justify-center gap-x-1">
                <FixFXIcon className="size-8" />
                <h1 className="text-fd-foreground text-2xl font-bold">
                  Core Documentation
                </h1>
              </div>
            ),
          },
          icon: <FixFXIcon className="size-6" />,
          text: "FixFX Core",
          description:
            "Some information about FixFX.",
          url: "/docs/core",
        },
        {
          menu: {
            banner: (
              <div className="flex h-20 w-full items-center justify-center gap-x-1">
                <FixFXIcon className="size-8" stroke="#2563eb" />
                <h1 className="text-fd-foreground text-2xl font-bold">
                  CitizenFX Documentation
                </h1>
              </div>
            ),
          },
          icon: <FixFXIcon className="size-6" stroke="#2563eb" />,
          text: "CitizenFX Ecosystem",
          description:
            "Explore some guides and information about the CitizenFX ecosystem.",
          url: "/docs/cfx",
        },
      ],
    },
    {
      type: "menu",
      text: "Blog",
      url: "/blog",
      items: [
        {
          menu: {
            banner: (
              <div className="flex h-20 w-full items-center justify-center gap-x-1">
                <h1 className="text-fd-foreground text-2xl font-bold">
                  Welcome to FixFX
                </h1>
              </div>
            ),
          },
          icon: <FixFXIcon className="size-6" />,
          text: "Introduction",
          description:
            "Welcome to FixFX, your comprehensive resource for CitizenFX.",
          url: "/blog/welcome",
        },
      ],
    },
  ],
};
