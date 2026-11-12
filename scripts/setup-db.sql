-- 로컬 PostgreSQL 17 (localhost:5433) 에 postgres 계정으로 한 번 실행
create role factory3d login password 'factory3d';
create database factory3d owner factory3d encoding 'UTF8' template template0;
create role factory3d_test login password 'factory3d_test';
create database factory3d_test owner factory3d_test encoding 'UTF8' template template0;
