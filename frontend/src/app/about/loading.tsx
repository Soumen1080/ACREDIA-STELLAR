import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function AboutLoading() {
    return (
        <div className="min-h-screen bg-background py-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto space-y-12">
                <div className="text-center space-y-3">
                    <Skeleton className="h-12 w-80 mx-auto" />
                    <Skeleton className="h-6 w-96 mx-auto" />
                </div>

                <Card className="p-8 space-y-6">
                    <Skeleton className="h-8 w-60" />
                    <div className="space-y-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                    </div>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} className="p-6 space-y-3">
                            <Skeleton className="h-10 w-10 rounded-xl" />
                            <Skeleton className="h-6 w-32" />
                            <Skeleton className="h-4 w-full" />
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
