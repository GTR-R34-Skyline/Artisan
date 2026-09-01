export interface ProductReview {
  id: string;
  productId: string;
  vendorId: string | null;
  consumerId: string | null;
  orderId: string | null;
  rating: number;
  comment: string | null;
  createdAt: string | null;
  reviewerName: string | null;
}

export interface ReviewEligibility {
  canSubmit: boolean;
  orderId: string | null;
  existingReview: ProductReview | null;
}

export interface ProductReviewSummary {
  reviews: ProductReview[];
  reviewCount: number;
  averageRating: number | null;
}

export interface ReviewDraft {
  rating: number;
  comment: string;
}
