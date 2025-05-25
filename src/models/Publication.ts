export enum PublicationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  SUCCESS = 'success',
  FAILED = 'failed',
  RETRYING = 'retrying'
}

export interface Publication {
  id: string;
  toolId: string;
  platform: string;
  status: PublicationStatus;
  timestamp: Date;
  platformPostId?: string;
  url?: string;
  error?: string;
  retryCount: number;
  maxRetries: number;
  metadata?: Record<string, any>;
}


export class PublicationManager {
  private publications: Map<string, Publication> = new Map();

  createPublication(toolId: string, platform: string, maxRetries: number = 3): Publication {
    const publication: Publication = {
      id: `${toolId}-${platform}-${Date.now()}`,
      toolId,
      platform,
      status: PublicationStatus.PENDING,
      timestamp: new Date(),
      retryCount: 0,
      maxRetries
    };

    this.publications.set(publication.id, publication);
    return publication;
  }

  updatePublication(id: string, updates: Partial<Publication>): void {
    const publication = this.publications.get(id);
    if (publication) {
      Object.assign(publication, updates);
    }
  }

  getPublication(id: string): Publication | undefined {
    return this.publications.get(id);
  }

  getPublicationsByTool(toolId: string): Publication[] {
    return Array.from(this.publications.values())
      .filter(pub => pub.toolId === toolId);
  }

  getPublicationsByPlatform(platform: string): Publication[] {
    return Array.from(this.publications.values())
      .filter(pub => pub.platform === platform);
  }

  getFailedPublications(): Publication[] {
    return Array.from(this.publications.values())
      .filter(pub => pub.status === PublicationStatus.FAILED);
  }

  shouldRetry(publication: Publication): boolean {
    return publication.status === PublicationStatus.FAILED && 
           publication.retryCount < publication.maxRetries;
  }
}