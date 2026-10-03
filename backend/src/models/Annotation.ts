import mongoose, { Document, Schema } from 'mongoose';

export interface IAnnotation extends Document {
  userId: mongoose.Types.ObjectId;
  bookId: mongoose.Types.ObjectId;
  pageNumber: number;
  selectedText: string;
  note: string;
  color: string;
  position: {
    rects: Array<{ x: number; y: number; width: number; height: number }>;
  };
  createdAt: Date;
}

const AnnotationSchema = new Schema<IAnnotation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
    pageNumber: { type: Number, required: true, min: 1 },
    selectedText: { type: String, required: true },
    note: { type: String, default: '' },
    color: { type: String, default: '#ffd700' },
    position: {
      rects: [
        {
          x: Number,
          y: Number,
          width: Number,
          height: Number,
        },
      ],
    },
  },
  { timestamps: true }
);

AnnotationSchema.index({ userId: 1, bookId: 1, pageNumber: 1 });

export const Annotation = mongoose.model<IAnnotation>('Annotation', AnnotationSchema);
