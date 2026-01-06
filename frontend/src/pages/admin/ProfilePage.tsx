import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { customInstance } from '@/api/mutator';

// Define types manually since generation might lag
interface UserUpdate {
    email?: string;
    full_name?: string;
}

interface PasswordChange {
    current_password: string;
    new_password: string;
}

const ProfilePage = () => {
    const { user } = useAuth();
    const [isUpdating, setIsUpdating] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    const { register: registerProfile, handleSubmit: handleProfileSubmit } = useForm<UserUpdate>({
        values: {
            email: user?.email,
            full_name: user?.full_name || '',
        },
    });

    const {
        register: registerPassword,
        handleSubmit: handlePasswordSubmit,
        reset: resetPassword,
        formState: { errors: passwordErrors },
    } = useForm<PasswordChange>();

    const onProfileSubmit = async (data: UserUpdate) => {
        setIsUpdating(true);
        try {
            await customInstance<void>({
                url: '/api/me',
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                data,
            });
            toast.success('Profile updated successfully');
            // Force reload or re-fetch user would be ideal here
            window.location.reload();
        } catch (error) {
            toast.error('Failed to update profile');
            console.error(error);
        } finally {
            setIsUpdating(false);
        }
    };

    const onPasswordSubmit = async (data: PasswordChange) => {
        setIsChangingPassword(true);
        try {
            await customInstance<void>({
                url: '/api/me/password',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                data,
            });
            toast.success('Password changed successfully');
            resetPassword();
        } catch (error) {
            toast.error('Failed to change password. check current password.');
            console.error(error);
        } finally {
            setIsChangingPassword(false);
        }
    };

    return (
        <div className="container max-w-4xl py-10 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Profile & Security</h1>
                <p className="text-muted-foreground">
                    Manage your personal information and account security.
                </p>
            </div>

            <div className="grid gap-8">
                {/* Profile Information */}
                <Card>
                    <CardHeader>
                        <CardTitle>Personal Information</CardTitle>
                        <CardDescription>Update your name and contact details.</CardDescription>
                    </CardHeader>
                    <form onSubmit={handleProfileSubmit(onProfileSubmit)}>
                        <CardContent className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    {...registerProfile('email')}
                                    disabled
                                    className="bg-muted"
                                />
                                <p className="text-[0.8rem] text-muted-foreground">
                                    Email cannot be changed directly. Contact admin.
                                </p>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="full_name">Full Name</Label>
                                <Input
                                    id="full_name"
                                    placeholder="John Doe"
                                    {...registerProfile('full_name')}
                                />
                            </div>
                        </CardContent>
                        <CardFooter className="border-t px-6 py-4">
                            <Button type="submit" disabled={isUpdating}>
                                {isUpdating ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                {/* Security */}
                <Card>
                    <CardHeader>
                        <CardTitle>Security</CardTitle>
                        <CardDescription>
                            Change your password to keep your account secure.
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handlePasswordSubmit(onPasswordSubmit)}>
                        <CardContent className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="current_password">Current Password</Label>
                                <Input
                                    id="current_password"
                                    type="password"
                                    {...registerPassword('current_password', { required: true })}
                                />
                                {passwordErrors.current_password && (
                                    <span className="text-red-500 text-xs">Required</span>
                                )}
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="new_password">New Password</Label>
                                <Input
                                    id="new_password"
                                    type="password"
                                    {...registerPassword('new_password', {
                                        required: true,
                                        minLength: 8,
                                    })}
                                />
                                {passwordErrors.new_password && (
                                    <span className="text-red-500 text-xs">
                                        Min 8 characters required
                                    </span>
                                )}
                            </div>
                        </CardContent>
                        <CardFooter className="border-t px-6 py-4">
                            <Button type="submit" disabled={isChangingPassword}>
                                {isChangingPassword ? 'Updating...' : 'Change Password'}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    );
};

export default ProfilePage;
