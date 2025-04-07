"use client";

import { Retro, Marquee, Shimmer } from "@ui/components";
import { cn, hooks } from "@utils/index";
import type { ReactNode } from "react";
import { APICard } from "@/components/landing/api";

import {
  Globe,
  Braces,
  Layers,
  Zap,
  Wrench,
  Sparkles,
  Hammer,
} from "@ui/icons";

function CommitCard({
  className,
  comment,
  icon,
}: {
  className?: string;
  comment: string;
  icon: ReactNode;
}) {
  return (
    <div
      className={cn(
        "dark:bg-fd-muted/25 bg-fd-muted border-fd-border/50 absolute inline-flex h-10 w-80 transform select-none items-center rounded-full border px-3 transition-all group-hover:-right-4 lg:w-72",
        className,
      )}
    >
      <span>{icon}</span>
      <Shimmer color="#888" className="font-mono text-xs" text={comment} />
    </div>
  );
}

const commits = [
  {
    comment: "fix(cli): no args passed",
    icon: <Wrench className="text-fd-foreground/50 mr-2 size-4" />,
    className: "-right-4",
  },
  {
    comment: "feat(core): health checker",
    icon: (
      <Sparkles className="text-fd-foreground/50 mr-2 size-4 transform transition group-hover:rotate-180 group-hover:fill-amber-500 group-hover:stroke-amber-500" />
    ),
    className: "-right-12 top-12",
  },
  {
    comment: "ref(docs): add missing props",
    icon: <Hammer className="text-fd-foreground/50 mr-2 size-4" />,
    className: "-right-24 top-24",
  },
];

export const features = [
  {
    Icon: Globe,
    name: "Open-Source Codebase",
    description:
      "Rehooks is an open-source project, licensed under Apache 2.0.",
    className:
      "lg:row-start-1 lg:row-end-1 lg:col-start-1 lg:col-end-2 rounded-t-2xl lg:rounded-tl-2xl lg:rounded-tr-none border-b-[0.5px] border-r-[1px] lg:border-r-[0.5px] border-t-[1px] border-l-[1px]",
    background: (
      <div className="absolute right-0 top-9">
        {commits.map((commit, index) => (
          <CommitCard
            className={commit.className}
            key={index}
            icon={commit.icon}
            comment={commit.comment}
          />
        ))}
      </div>
    ),
  },
  {
    Icon: Braces,
    name: "Rehooks API",
    description:
      "Rehooks provides a structured API that allows you to easily access the hooks you need.",
    className:
      "lg:col-start-3 lg:col-end-3 lg:row-start-2 lg:row-end-2 lg:rounded-br-2xl lg:rounded-tr-none border-b-[0.5px] lg:border-b-[1px] border-r-[1px] border-t-[0.5px] border-l-[1px] lg:border-l-[0.5px]",
    background: (
      <div className="flex h-full w-full items-center justify-center">
        <APICard
          className="absolute top-20"
          method="GET"
          endpoint="/api/hooks/:title"
        />
      </div>
    ),
  },
  {
    Icon: Layers,
    name: "Variety of Hooks",
    description:
      "Rehooks offers a diverse variety of powerful hooks for different use cases, to efficiently implement functionality in components.",
    className:
      "lg:col-start-1 lg:col-end-3 lg:row-start-2 lg:row-end-3 lg:rounded-bl-2xl border-b-[1px] lg:border-r-[0.5px] border-t-[0.5px] border-l-[1px] lg:rounded-bl-2xl border-b-[0.5px] lg:border-b-[1px] border-r-[1px] border-t-[0.5px] border-l-[1px]",
    background: (
      <>
        <Marquee
          pauseOnHover
          className="absolute top-10 h-64 [--duration:20s] [mask-image:linear-gradient(to_top,transparent_40%,#000_100%)] lg:rounded-bl-2xl"
        >
          {hooks.map((hook, idx) => (
            <figure
              key={idx}
              className={cn(
                "relative w-44 cursor-pointer overflow-hidden rounded-xl border p-4",
                "border-neutral-950/[.1] bg-neutral-950/[.01] hover:bg-neutral-950/[.05]",
                "dark:border-neutral-50/[.1] dark:bg-neutral-50/[.10] dark:hover:bg-neutral-50/[.15]",
                "transform-gpu transition-all duration-300 ease-in-out",
              )}
            >
              <div className="flex flex-row items-center gap-2">
                <div className="flex flex-col">
                  <figcaption className="text-sm font-medium dark:text-white">
                    {hook.title}
                  </figcaption>
                </div>
              </div>
              <blockquote className="mt-2 text-xs">
                {hook.description}
              </blockquote>
            </figure>
          ))}
        </Marquee>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-white dark:from-neutral-950"></div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-white dark:from-neutral-950"></div>
      </>
    ),
  },
  {
    Icon: Zap,
    name: "Performant & Reusability",
    description:
      "Crafted with SOLID principles, ensuring type-safety and maintainability throughout the codebase.",
    className:
      "lg:col-start-2 lg:col-end-4 lg:row-start-1 lg:row-end-1 rounded-b-2xl lg:rounded-br-none lg:rounded-tr-2xl lg:rounded-bl-none border-b-[1px] lg:border-b-[0.5px] border-r-[1px] border-t-[1px] border-l-[1px] lg:border-l-[0.5px]",
    background: (
      <Retro
        angle={15}
        cellSize={75}
        darkLineColor="#666666"
        lightLineColor="#000000"
        className="absolute inset-0"
      />
    ),
  },
];
