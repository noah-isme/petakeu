import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const statCardVariants = cva(
  "relative overflow-hidden rounded-xl border transition-all duration-300",
  {
    variants: {
      variant: {
        default: "bg-white hover:shadow-lg",
        success: "bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 hover:shadow-green-100",
        warning: "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200 hover:shadow-amber-100",
        danger: "bg-gradient-to-br from-red-50 to-rose-50 border-red-200 hover:shadow-red-100",
        info: "bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 hover:shadow-blue-100",
        purple: "bg-gradient-to-br from-purple-50 to-violet-50 border-purple-200 hover:shadow-purple-100",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface StatCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statCardVariants> {
  title: string
  value: string | number
  description?: string
  icon?: React.ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, variant, title, value, description, icon, trend, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(statCardVariants({ variant, className }))}
        {...props}
      >
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
              <h3 className="text-3xl font-bold text-gray-900 mb-2">{value}</h3>
              {description && (
                <p className="text-sm text-gray-500">{description}</p>
              )}
            </div>
            {icon && (
              <div className="ml-4 flex-shrink-0">
                <div className="w-12 h-12 rounded-lg bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm">
                  {icon}
                </div>
              </div>
            )}
          </div>
          {trend && (
            <div className="mt-4 flex items-center">
              <span
                className={cn(
                  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                  trend.isPositive
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                )}
              >
                <svg
                  className={cn(
                    "w-4 h-4 mr-1",
                    trend.isPositive ? "rotate-0" : "rotate-180"
                  )}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 10l7-7m0 0l7 7m-7-7v18"
                  />
                </svg>
                {Math.abs(trend.value)}%
              </span>
              <span className="ml-2 text-sm text-gray-500">vs last period</span>
            </div>
          )}
        </div>
        {/* Decorative gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
      </div>
    )
  }
)

StatCard.displayName = "StatCard"

export { StatCard, statCardVariants }
