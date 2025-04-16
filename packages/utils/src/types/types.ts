export type Hook = Readonly<{
  id: number;
  title: string;
  description: string;
  content: string;
}>;

export type Card = {
  label: string;
  title: string;
  content?: string;
  code?: string;
  className?: string;
};

export interface GitHubTag {
  name: string;
  zipball_url: string;
  tarball_url: string;
  commit: {
    sha: string;
    url: string;
  };
  node_id: string;
}

export interface GitHubCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
}

export interface GitHubIssue {
  number: number;
  title: string;
  body?: string;
  state: string;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface ArtifactVersion {
  version: string;
  recommended: boolean;
  critical: boolean;
  download_urls: {
    zip: string;
    '7z': string;
  };
  artifact_url: string;
  published_at: string;
  eol?: boolean;
  supportStatus?: string;
  supportEnds?: string;
}

export interface ArtifactCategory {
  [version: string]: ArtifactVersion;
}

export interface ArtifactData {
  windows: ArtifactCategory;
  linux: ArtifactCategory;
}
