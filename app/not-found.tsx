import { Button } from "@ui/components/button";
import { FaDiscord } from "react-icons/fa";
import { ArrowLeft, Gamepad2 } from "lucide-react";
import { DISCORD_LINK } from "@utils/constants/link";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4">
      {/* Animated background elements */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.1),rgba(255,255,255,0))]" />
        <div className="absolute left-0 top-0 h-32 w-32 animate-pulse rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-32 w-32 animate-pulse rounded-full bg-primary/20 blur-3xl" />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-8 text-center">
        {/* 404 text with gaming style */}
        <div className="relative">
          <h1 className="text-9xl font-bold tracking-tighter text-primary">
            404
          </h1>
          <div className="absolute -right-4 -top-4 h-4 w-4 animate-ping rounded-full bg-primary" />
          <div className="absolute -bottom-4 -left-4 h-4 w-4 animate-ping rounded-full bg-primary" />
        </div>

        {/* Gamepad icon with animation */}
        <div className="relative">
          <Gamepad2 className="h-16 w-16 text-primary" />
          <div className="absolute -inset-4 animate-ping rounded-full bg-primary/20" />
        </div>

        {/* Message */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">
            Level Not Found
          </h2>
          <p className="text-muted-foreground">
            Looks like you've wandered into uncharted territory. Let's get you back on track!
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button asChild variant="default" size="default">
            <Link href="/" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Return to Base
            </Link>
          </Button>

          <Button asChild variant="outline" size="default">
            <Link
              href={DISCORD_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="gap-2 "
            >
              <FaDiscord className="h-4 w-4" />
              Join our Discord
            </Link>
          </Button>
        </div>
      </div>

      {/* Decorative elements */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}
