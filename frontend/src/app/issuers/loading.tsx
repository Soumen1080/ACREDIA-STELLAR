import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function IssuersLoading() {
    return (
        <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="text-center space-y-2">
                    <Skeleton className="h-10 w-64 mx-auto" />
                    <Skeleton className="h-5 w-96 mx-auto" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Card key={i} className="p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <Skeleton className="h-12 w-12 rounded-xl" />
                                <div className="space-y-1 flex-1">
                                    <Skeleton className="h-5 w-36" />
                                    <Skeleton className="h-3 w-24" />
                                </div>
                            </div>
                            <Skeleton className="h-4 w-full" />
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
